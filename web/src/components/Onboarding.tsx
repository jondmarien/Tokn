"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { Avatar } from "@/components/Avatar";
import { SETUP_SEEN_COOKIE, SETUP_SEEN_MAX_AGE } from "@/lib/onboarding";
import { AVATAR_STYLES, type AvatarStyle } from "@/lib/prefs";
import { Terminal } from "@/components/Terminal";
import {
  ArtWelcome,
  ArtProfile,
  ArtInstall,
  ArtLink,
  ArtSecure,
  ArtDone,
} from "@/components/OnboardingArt";

/**
 * What a new account sees once, immediately after signing up.
 *
 * The order follows what the reader can actually do: say who they are, install
 * the CLI, link a machine, optionally add a passkey, then look at the thing
 * they came for. Identity comes first because it needs nothing but this page —
 * everything after it needs a terminal.
 *
 * Three decisions worth keeping:
 *
 * The link step has no "next" button. It polls, and advances by itself the
 * moment the machine connects. A button there would ask the reader to tell us
 * something we already know, and it is the one step where they must leave the
 * page — so when they come back, it should already have moved on.
 *
 * Skipping the CLI skips *the CLI*, not the flow. Install and connect are one
 * unit of work that needs a terminal, and someone who is not sitting at one
 * still has a passkey worth adding. Leaving entirely stays possible, but it is
 * a separate and quieter control.
 *
 * Every step can be left. A tutorial that traps someone is worse than none.
 */

type Step = "welcome" | "profile" | "install" | "link" | "secure" | "done";

/**
 * The progress dots. "welcome" is deliberately absent: it is a greeting, not a
 * task, and numbering it would tell the reader they have six things to do when
 * they have five.
 */
const STEPS: { key: Step; label: string }[] = [
  { key: "profile", label: "profile" },
  { key: "install", label: "install" },
  { key: "link", label: "connect" },
  { key: "secure", label: "secure" },
  { key: "done", label: "done" },
];

const MAX_NAME = 60;

export function Onboarding({
  handle: initialHandle,
  initialName,
  initialAvatar,
  avatarUrl,
  handleChangesLeft,
  initialCode,
  initialExpiry,
  alreadyLinked,
  hasPasskey,
}: {
  handle: string;
  initialName: string | null;
  initialAvatar: AvatarStyle;
  avatarUrl: string | null;
  /** How many handle changes the account has left, for an honest warning. */
  handleChangesLeft: number;
  initialCode: string;
  initialExpiry: string;
  /** True when a machine connected before they reached this page. */
  alreadyLinked: boolean;
  hasPasskey: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [code, setCode] = useState(initialCode);
  const [expiresAt, setExpiresAt] = useState(initialExpiry);
  const [linked, setLinked] = useState(alreadyLinked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyAdded, setPasskeyAdded] = useState(hasPasskey);

  const index = STEPS.findIndex((s) => s.key === step);

  // Mark the browser the moment the flow opens, not when it is completed.
  // Someone who is shown this and closes the tab has been offered it, and
  // re-offering it on their next visit to their own account would be nagging.
  // Written from the client because a Server Component cannot set a cookie.
  useEffect(() => {
    document.cookie = `${SETUP_SEEN_COOKIE}=1; path=/; max-age=${SETUP_SEEN_MAX_AGE}; samesite=lax`;
  }, []);

  /* ----------------------------------------------------------- identity */

  const [handle, setHandle] = useState(initialHandle);
  const [name, setName] = useState(initialName ?? "");
  const [avatar, setAvatar] = useState<AvatarStyle>(initialAvatar);

  /** Where the flow goes once identity is settled. */
  const afterProfile = useCallback(
    () => setStep(linked ? "secure" : "install"),
    [linked],
  );

  async function saveIdentity() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, name, avatar }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "that did not save");
      setHandle(result.handle);
      router.refresh();
      afterProfile();
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------------------------------------- linking */

  /**
   * The live code, read by the poller.
   *
   * Held in a ref so the polling effect below never lists `code` as a
   * dependency. If it did, issuing a fresh code would tear the interval down
   * and rebuild it mid-flight; the ref lets one long-lived timer always read
   * the current value instead.
   */
  const codeRef = useRef(code);
  codeRef.current = code;

  /** Guards against two refreshes racing when a poll overlaps a click. */
  const refreshing = useRef(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const refreshCode = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const response = await fetch("/api/link/code", { method: "POST" });
      if (!response.ok) throw new Error("could not issue a new code");
      const fresh = (await response.json()) as { code: string; expiresAt: string };
      setCode(fresh.code);
      setExpiresAt(fresh.expiresAt);
      setError(null);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      refreshing.current = false;
    }
  }, []);

  // The countdown starts as null and is filled on the first client frame:
  // `Date.now()` differs between the server render and hydration, and rendering
  // it directly is a mismatch.
  useEffect(() => {
    if (step !== "link") return;
    const tick = () => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [step, expiresAt]);

  useEffect(() => {
    if (step !== "link" || linked) return;

    // Poll on an interval that does not depend on any state this effect also
    // sets — an earlier version of this pattern elsewhere in the app tore the
    // timer down on every tick and never fired.
    let alive = true;
    const check = async () => {
      try {
        // Both halves of this call were wrong before and failed silently. The
        // endpoint needs the code it is being asked about, and it answers with
        // a `status` string — not the `linked`/`expired` booleans this once
        // read, which were always undefined. The effect was that the panel
        // never advanced on connect and never replaced an expired code, so a
        // code that timed out stayed on screen as a dead number forever.
        const response = await fetch(
          `/api/link/status?code=${encodeURIComponent(codeRef.current)}`,
          { cache: "no-store" },
        );
        if (!response.ok || !alive) return;
        const data = (await response.json()) as {
          status: "pending" | "linked" | "expired";
        };
        if (!alive) return;

        if (data.status === "linked") {
          setLinked(true);
          setStep("secure");
          router.refresh();
        } else if (data.status === "expired") {
          await refreshCode();
        }
      } catch {
        // A dropped poll is not worth showing anyone; the next one will do.
      }
    };
    void check();
    const timer = setInterval(check, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [step, linked, router, refreshCode]);

  /* ---------------------------------------------------------- passkeys */

  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => setCanPasskey(browserSupportsWebAuthn()), []);

  async function addPasskey() {
    setBusy(true);
    setError(null);
    try {
      const optionsResponse = await fetch("/api/passkeys/register/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error ?? "could not start");

      const attestation = await startRegistration({ optionsJSON: options });

      const verifyResponse = await fetch("/api/passkeys/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(attestation),
      });
      const verified = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(verified.error ?? "that did not work");

      setPasskeyAdded(true);
      setStep("done");
    } catch (problem) {
      const message = (problem as Error).message;
      // Dismissing the platform prompt is a decision, not an error.
      setError(/abort|NotAllowed/i.test(message) ? null : message);
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------ render */

  return (
    <div style={{ maxWidth: "34rem", margin: "2.5rem auto 0", width: "100%" }}>
      {step !== "welcome" && (
        <ol className="onboard-steps" aria-label="setup progress">
          {STEPS.map((s, i) => (
            <li key={s.key} data-state={i < index ? "done" : i === index ? "now" : "todo"}>
              <span className="dot" aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ol>
      )}

      <div className="onboard-art">
        {step === "welcome" && <ArtWelcome />}
        {step === "profile" && <ArtProfile />}
        {step === "install" && <ArtInstall />}
        {step === "link" && <ArtLink />}
        {step === "secure" && <ArtSecure />}
        {step === "done" && <ArtDone />}
      </div>

      {step === "welcome" && (
        <section>
          <h1 className="title">welcome to tokn</h1>
          <p className="lede" style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
            it reads what your AI coding tools already write to disk and turns it
            into a picture of what you actually spend. setting up takes about two
            minutes.
          </p>
          <div className="onboard-actions">
            <button type="button" className="btn primary" onClick={() => setStep("profile")}>
              get started
            </button>
            <Link href="/account" className="micro link">
              I will do this later
            </Link>
          </div>
        </section>
      )}

      {step === "profile" && (
        <section>
          <h1 className="title">who are you</h1>
          <p className="lede" style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
            your handle is how people find you. the display name is what appears
            beside it. both can be changed later.
          </p>

          <div className="onboard-identity">
            <div className="onboard-avatar">
              <Avatar handle={handle || initialHandle} size={72} style={avatar} url={avatarUrl} />
              <div className="onboard-avatar-picks" role="group" aria-label="avatar style">
                {AVATAR_STYLES.map((option) => {
                  // "github" has nothing to draw without an avatar from GitHub.
                  const unavailable = option === "github" && !avatarUrl;
                  return (
                    <button
                      key={option}
                      type="button"
                      className="btn bare"
                      aria-pressed={option === avatar}
                      data-on={option === avatar ? "" : undefined}
                      disabled={unavailable}
                      title={unavailable ? "no github avatar on this account" : undefined}
                      onClick={() => setAvatar(option)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="onboard-fields">
              <div className="field">
                <label htmlFor="onboard-handle">handle</label>
                <input
                  id="onboard-handle"
                  className="input"
                  value={handle}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => setHandle(event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="onboard-name">display name</label>
                <input
                  id="onboard-name"
                  className="input"
                  value={name}
                  maxLength={MAX_NAME}
                  placeholder="optional"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            </div>
          </div>

          {handle !== initialHandle && (
            <p className="micro" style={{ marginTop: "0.75rem" }}>
              changing your handle uses one of your {handleChangesLeft} remaining
              changes.
            </p>
          )}

          {error && (
            <p className="micro" style={{ marginTop: "0.75rem", color: "var(--error)" }}>
              {error}
            </p>
          )}

          <div className="onboard-actions">
            <button
              type="button"
              className="btn primary"
              onClick={saveIdentity}
              disabled={busy || !handle.trim()}
            >
              {busy ? "…" : "continue"}
            </button>
            <button type="button" className="btn" onClick={afterProfile} disabled={busy}>
              keep what I have
            </button>
          </div>
        </section>
      )}

      {step === "install" && (
        <section>
          <h1 className="title">install the cli</h1>
          <p className="lede" style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
            it reads the session logs your AI tools already write to disk. nothing is
            uploaded until you link an account.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Terminal commands={["npm install -g toknhq"]} />
          </div>
          <p className="micro" style={{ marginTop: "1rem" }}>
            needs node 22.5 or newer. the command it installs is{" "}
            <span className="kbd">tokn</span>.
          </p>
          <div className="onboard-actions">
            <button type="button" className="btn primary" onClick={() => setStep("link")}>
              next
            </button>
            {/* Skips the CLI, not the flow: install and connect are one unit of
                work that needs a terminal, and a passkey is still worth having
                to someone who is not sitting at one. */}
            <button type="button" className="btn" onClick={() => setStep("secure")}>
              not at a terminal
            </button>
          </div>
        </section>
      )}

      {step === "link" && (
        <section>
          <h1 className="title">connect this machine</h1>
          <p className="lede" style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
            run this, and paste the code when it asks.
          </p>

          <div style={{ marginTop: "1.5rem" }}>
            <Terminal commands={["tokn link"]} />
          </div>

          <div className="onboard-code" aria-live="polite">
            <span className="micro">your code</span>
            <strong>{code}</strong>
            <span className="micro">
              {remaining === null
                ? " "
                : remaining > 0
                  ? `expires in ${clock(remaining)}`
                  : "expired — fetching a new one"}
            </span>
          </div>

          {error && (
            <p className="micro" style={{ marginTop: "0.75rem", color: "var(--error)" }}>
              {error}
            </p>
          )}

          <p className="micro onboard-waiting">
            <span className="spin" aria-hidden="true" />
            waiting for the machine to connect — this page moves on by itself
          </p>

          <div className="onboard-actions">
            <button type="button" className="btn" onClick={() => void refreshCode()}>
              new code
            </button>
            <button type="button" className="btn" onClick={() => setStep("secure")}>
              do this later
            </button>
          </div>
        </section>
      )}

      {step === "secure" && (
        <section>
          <h1 className="title">{linked ? "connected" : "secure your account"}</h1>
          <p className="lede" style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
            {linked
              ? "your machine is linked. one more thing worth thirty seconds: "
              : "worth thirty seconds: "}
            add a passkey so you can sign in with your fingerprint or face instead
            of a password.
          </p>

          {passkeyAdded ? (
            <>
              <p className="micro" style={{ marginTop: "1.25rem" }}>
                a passkey is already on this account.
              </p>
              <div className="onboard-actions">
                <button type="button" className="btn primary" onClick={() => setStep("done")}>
                  continue
                </button>
              </div>
            </>
          ) : canPasskey ? (
            <>
              {error && (
                <p className="micro" style={{ marginTop: "1rem", color: "var(--error)" }}>
                  {error}
                </p>
              )}
              <div className="onboard-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={addPasskey}
                  disabled={busy}
                >
                  {busy ? "…" : "add a passkey"}
                </button>
                <button type="button" className="btn" onClick={() => setStep("done")}>
                  not now
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="micro" style={{ marginTop: "1.25rem" }}>
                this browser has no authenticator to offer. you can add one later from
                account settings.
              </p>
              <div className="onboard-actions">
                <button type="button" className="btn primary" onClick={() => setStep("done")}>
                  continue
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === "done" && (
        <section>
          <h1 className="title">you are set up</h1>
          <p className="lede" style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
            {linked
              ? "run tokn sync whenever you want to publish, or let it run in the background."
              : "install and link whenever you are ready — the steps are on the connect page."}
          </p>

          <div style={{ marginTop: "1.5rem" }}>
            <Terminal commands={linked ? ["tokn sync"] : ["tokn link", "tokn sync"]} />
          </div>

          <div className="onboard-actions">
            <Link href="/account" className="btn primary">
              go to your usage
            </Link>
            <Link href={`/profile/${handle}`} className="btn">
              see your profile
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

/** mm:ss, the same shape the connect page's countdown uses. */
function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The device-link panel.
 *
 * A code is good for ten minutes and for exactly one machine. While it is on
 * screen the page polls for redemption, so it flips to "connected" the instant
 * the CLI accepts it and nobody has to come back and refresh.
 *
 * The countdown is also a hairline that drains. It carries the same
 * information as the digits, but you can read it without reading it.
 */

const POLL_MS = 2000;
const TTL_MS = 10 * 60 * 1000;

export function LinkPanel({
  initialCode,
  initialExpiry,
}: {
  initialCode: string;
  initialExpiry: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [expiresAt, setExpiresAt] = useState(initialExpiry);
  // Seeded with the full TTL rather than the real remaining time: `Date.now()`
  // differs between the server render and hydration, which React reports as a
  // mismatch. The effect below corrects it on the first client frame.
  const [remaining, setRemaining] = useState(TTL_MS);
  const [linked, setLinked] = useState<{
    hostname?: string;
    platform?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef(code);

  codeRef.current = code;

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/link/code", { method: "POST" });
      if (!response.ok) throw new Error("could not issue a new code");
      const data = (await response.json()) as {
        code: string;
        expiresAt: string;
      };
      setCode(data.code);
      setExpiresAt(data.expiresAt);
      setRemaining(msLeft(data.expiresAt));
      setLinked(null);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const tick = () => setRemaining(msLeft(expiresAt));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // Derived as a boolean on purpose. `remaining` changes every 500ms, and
  // depending on it directly tore this effect down and rebuilt it before the
  // 2000ms interval below could ever fire, so the poll never ran and the panel
  // sat on "waiting for the cli" forever. A boolean only flips once.
  const expired = remaining <= 0;

  useEffect(() => {
    if (linked || expired) return;

    const check = async () => {
      try {
        const response = await fetch(
          `/api/link/status?code=${encodeURIComponent(codeRef.current)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          status: "pending" | "linked" | "expired";
          device?: { hostname?: string; platform?: string };
        };
        if (data.status === "linked") {
          setLinked(data.device ?? {});
          router.refresh();
        }
      } catch {
        // A dropped poll is harmless; the next tick tries again.
      }
    };

    // Ask once immediately, so a code redeemed while the page was loading is
    // caught without waiting out a full interval.
    void check();
    const timer = setInterval(check, POLL_MS);

    return () => clearInterval(timer);
  }, [linked, expired, router]);

  if (linked) {
    return (
      <section>
        <div>
          <div className="tokn-connected-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5 10 17.5 19 7"
                stroke="var(--main)"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Announced politely: the panel changes while the user is most
              likely looking at their terminal, not this tab. */}
          <p
            className="block-label tokn-rise"
            role="status"
            aria-live="polite"
            style={{ marginTop: "1.25rem", animationDelay: "120ms" }}
          >
            connected
          </p>

          <p
            className="block-value tokn-rise"
            style={{ animationDelay: "200ms" }}
          >
            {linked.hostname ?? "this machine"}
            {linked.platform ? (
              <span className="sub"> · {linked.platform}</span>
            ) : null}
          </p>

          <p
            className="sub tokn-rise"
            style={{
              marginTop: "0.9rem",
              fontSize: "0.8125rem",
              animationDelay: "280ms",
            }}
          >
            run <span className="kbd">tokn sync</span> to publish your usage,
            then open your{" "}
            <a href="/account" className="main link">
              account
            </a>
          </p>

          <button
            type="button"
            className="btn tokn-rise"
            onClick={refresh}
            disabled={busy}
            style={{ marginTop: "1.25rem", animationDelay: "360ms" }}
          >
            connect another machine
          </button>
        </div>
      </section>
    );
  }

  const progress = Math.max(0, Math.min(1, remaining / TTL_MS));

  return (
    <section>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <p className="block-label">one-time code</p>
          <span className="micro">
            {expired ? "expired" : clock(remaining)}
          </span>
        </div>

        <p
          style={{
            marginTop: "1rem",
            fontSize: "clamp(1.75rem, 5.5vw, 2.5rem)",
            letterSpacing: "0.14em",
            lineHeight: 1,
            color: expired ? "var(--sub)" : "var(--main)",
            userSelect: "all",
            transition: "color var(--t-base) var(--ease-out)",
          }}
        >
          {code}
        </p>

        <p className="micro" style={{ marginTop: "1rem" }}>
          {expired
            ? "generate a fresh one when you are ready"
            : "type this into the cli when it asks"}
        </p>
      </div>

      {/* How much life the code has left, as a line that drains. */}
      <div
        style={{
          height: 2,
          marginTop: "1.5rem",
          borderRadius: 2,
          background: "var(--sub-alt)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: "var(--main)",
            opacity: progress < 0.2 ? 0.45 : 1,
            transition:
              "width 500ms linear, opacity var(--t-base) var(--ease-out)",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          marginTop: "1rem",
        }}
      >
        <span className="micro">
          {expired ? "no longer valid" : "waiting for the cli…"}
        </span>
        <button type="button" className="btn" onClick={refresh} disabled={busy}>
          {busy ? "…" : "new code"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: "1rem" }}>
          <div className="notice">{error}</div>
        </div>
      )}
    </section>
  );
}

function msLeft(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

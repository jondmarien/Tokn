"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { relative } from "@/lib/format";

/**
 * Passkey management in settings.
 *
 * A passkey replaces the password with something held by the device: nothing
 * to remember, nothing to phish, and nothing on our side that could be stolen
 * and reused — only public keys are stored.
 */

export interface PasskeyRow {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function Passkeys({ initial }: { initial: PasskeyRow[] }) {
  const router = useRouter();
  const [keys, setKeys] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);

    try {
      const optionsResponse = await fetch("/api/passkeys/register/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error ?? "could not start");

      // Opens the platform prompt: Touch ID, Windows Hello, a phone, a key.
      const attestation = await startRegistration({ optionsJSON: options });

      const verifyResponse = await fetch("/api/passkeys/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: attestation, label: deviceLabel() }),
      });
      const verified = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(verified.error ?? "could not add that passkey");

      router.refresh();
      setKeys((current) => [
        ...current,
        { id: attestation.id, label: verified.label, createdAt: new Date().toISOString(), lastUsedAt: null },
      ]);
    } catch (problem) {
      const message = (problem as Error).message;
      // Cancelling the platform prompt is a choice, not a failure.
      setError(/abort|NotAllowed/i.test(message) ? null : message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/passkeys/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "could not remove that passkey");
      }
      setKeys((current) => current.filter((key) => key.id !== id));
      router.refresh();
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setting">
      <div className="setting-label">
        passkeys
        <small>sign in with touch id, windows hello, or your phone</small>
      </div>

      <div>
        {keys.length === 0 ? (
          <p className="micro" style={{ marginBottom: "0.75rem" }}>
            no passkeys yet. your password still works either way.
          </p>
        ) : (
          <ul className="keylist">
            {keys.map((key) => (
              <li key={key.id}>
                <KeyGlyph />
                <span className="name">{key.label}</span>
                <span className="micro">
                  {key.lastUsedAt ? `used ${relative(key.lastUsedAt)}` : "never used"}
                </span>
                <button
                  type="button"
                  className="btn bare"
                  onClick={() => remove(key.id)}
                  disabled={busy}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="notice" role="alert" style={{ marginBottom: "0.75rem" }}>
            {error}
          </div>
        )}

        {/* Not a submit: this runs its own ceremony and must not save the form. */}
        <button type="button" className="btn" onClick={add} disabled={busy}>
          {busy ? "waiting for your device…" : "add a passkey"}
        </button>

        <p className="micro" style={{ marginTop: "0.6rem" }}>
          only a public key is stored. there is nothing here that could be stolen and used to sign
          in as you.
        </p>
      </div>
    </div>
  );
}

/** A guess at which device this is, so a list of keys is tellable apart. */
function deviceLabel(): string {
  const agent = navigator.userAgent;
  if (/iPhone|iPad/.test(agent)) return "iphone or ipad";
  if (/Android/.test(agent)) return "android";
  if (/Mac/.test(agent)) return "mac";
  if (/Windows/.test(agent)) return "windows";
  if (/Linux/.test(agent)) return "linux";
  return "passkey";
}

function KeyGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3M15.5 12v2.5" />
    </svg>
  );
}

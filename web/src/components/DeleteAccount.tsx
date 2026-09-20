"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Account deletion, gated behind typing your own handle.
 *
 * There is no undo and no grace period, which is what the privacy policy
 * promises, so a stray click must not be enough to trigger it.
 */
export function DeleteAccount({ handle }: { handle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = confirm.trim().toLowerCase() === handle.toLowerCase();

  async function remove() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "could not delete the account");
        return;
      }

      // The whole tree renders off the session cookie, which is now gone.
      router.push("/");
      router.refresh();
    } catch {
      setError("could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ marginTop: "3rem", paddingTop: "1.75rem", borderTop: "1px solid var(--line)" }}>
        <p className="block-label" style={{ marginBottom: "0.6rem" }}>
          delete account
        </p>
        <p className="micro" style={{ marginBottom: "1rem", lineHeight: 1.7 }}>
          Removes your profile, every usage row, your linked machines and your
          sessions. You come off the leaderboard straight away. There is no undo.
        </p>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          delete my account
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "3rem", paddingTop: "1.75rem", borderTop: "1px solid var(--line)" }}>
      <p className="block-label" style={{ marginBottom: "0.6rem" }}>
        delete account
      </p>
      <p className="micro" style={{ marginBottom: "1rem", lineHeight: 1.7 }}>
        Type <span className="kbd">{handle}</span> to confirm. This cannot be
        undone.
      </p>

      <div style={{ display: "grid", gap: "0.75rem", maxWidth: "20rem" }}>
        <input
          className="input"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder={handle}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label={`type ${handle} to confirm deletion`}
        />

        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button
            type="button"
            className="btn"
            onClick={remove}
            disabled={!matches || busy}
            style={{ color: matches ? "var(--error, #e05561)" : undefined }}
          >
            {busy ? "deleting…" : "delete permanently"}
          </button>
          <button
            type="button"
            className="btn bare"
            onClick={() => {
              setOpen(false);
              setConfirm("");
              setError(null);
            }}
          >
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}

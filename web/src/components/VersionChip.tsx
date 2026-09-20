"use client";

import { useEffect, useRef, useState } from "react";
import { CURRENT_VERSION, RELEASES } from "@/lib/releases";
import { niceDay } from "@/lib/format";

/**
 * The version chip in the footer, and the release notes it opens.
 *
 * Notes come from `lib/releases.ts` rather than a git host: they should render
 * with no network, and a release is something written on purpose rather than a
 * dump of commit subjects.
 */

export function VersionChip() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="chip"
        onClick={() => setOpen(true)}
        title="what changed"
        aria-haspopup="dialog"
      >
        <BranchGlyph />v{CURRENT_VERSION}
      </button>

      {open && <ReleaseDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ReleaseDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="release notes"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet wide">
        <div className="sheet-search" style={{ justifyContent: "space-between" }}>
          <span className="block-label">what changed</span>
          <button ref={closeRef} type="button" className="btn bare" onClick={onClose}>
            close
          </button>
        </div>

        <div className="sheet-list notes">
          {RELEASES.map((release) => (
            <article key={release.version} className="release">
              <header className="row spread" style={{ alignItems: "baseline" }}>
                <h2 className="big">v{release.version}</h2>
                <span className="micro">{niceDay(release.date)}</span>
              </header>

              {release.summary && (
                <p className="sub" style={{ fontSize: "0.8125rem", marginTop: "0.35rem" }}>
                  {release.summary}
                </p>
              )}

              {release.notes.map((note) => (
                <section key={note.heading} style={{ marginTop: "1.25rem" }}>
                  <p className="block-label">{note.heading}</p>
                  <ul className="notes-list">
                    {note.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          ))}
        </div>

        <div className="sheet-foot">
          <span className="micro">
            <span className="kbd">esc</span> to close
          </span>
        </div>
      </div>
    </div>
  );
}

function BranchGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="5" r="2.2" />
      <circle cx="7" cy="19" r="2.2" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M7 7.2v9.6M17 11.2c0 3.2-3 3.6-5 4.4" />
    </svg>
  );
}

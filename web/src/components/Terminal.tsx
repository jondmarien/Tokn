"use client";

import { useEffect, useState } from "react";

/**
 * Shell commands you can click to copy.
 *
 * This is the one place the site uses a monospace block, because it is the one
 * place the reader is about to use a terminal. The prompt character is
 * decorative and is excluded from what gets copied.
 */

export function Terminal({ commands }: { commands: string[] }) {
  return (
    <div className="term">
      {commands.map((command) => (
        <CommandLine key={command} command={command} />
      ))}
    </div>
  );
}

function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Blocked clipboard (insecure origin, denied permission). Selecting the
      // text by hand still works, so there is nothing to report.
    }
  }

  return (
    <button type="button" className="term-line" onClick={copy} aria-label={`Copy: ${command}`}>
      <span className="prompt" aria-hidden="true">
        $
      </span>
      <span>{command}</span>
      <span className="copy" aria-hidden="true">
        {copied ? <CheckGlyph /> : <CopyGlyph />}
      </span>
    </button>
  );
}

function CopyGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 12 9 17 20 6" />
    </svg>
  );
}

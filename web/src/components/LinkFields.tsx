"use client";

import { useState } from "react";
import { MAX_LINKS } from "@/lib/links";

/**
 * The link rows in settings: a fixed first pair, then "Add link" up to the cap.
 *
 * Client-side only so a row can be added without a round trip; the values are
 * plain inputs, so the surrounding server action reads them from FormData with
 * no extra wiring.
 */
export function LinkFields({ initial }: { initial: string[] }) {
  const seeded = initial.length > 0 ? initial : [""];
  const [rows, setRows] = useState<string[]>(seeded.length < 2 ? [...seeded, ""] : seeded);

  const update = (index: number, value: string) =>
    setRows((current) => current.map((row, at) => (at === index ? value : row)));

  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      {rows.map((value, index) => (
        <input
          key={index}
          name="link"
          className="input"
          value={value}
          onChange={(event) => update(index, event.target.value)}
          placeholder={index === 0 ? "github.com/yourname" : "x.com/yourname"}
          spellCheck={false}
          autoCapitalize="none"
          inputMode="url"
          aria-label={`Profile link ${index + 1}`}
        />
      ))}

      {rows.length < MAX_LINKS && (
        <button
          type="button"
          className="btn plain"
          style={{ justifySelf: "start", color: "var(--dim)" }}
          onClick={() => setRows((current) => [...current, ""])}
        >
          Add link
        </button>
      )}
    </div>
  );
}

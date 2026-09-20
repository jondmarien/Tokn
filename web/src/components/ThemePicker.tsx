"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { THEMES, findTheme, isDark, type Theme } from "@/lib/themes";
import { DEFAULT_THEME, THEME_KEY } from "./theme";

/**
 * The theme picker: a chip in the footer that opens a searchable list.
 *
 * Hovering a row applies that theme to the whole page immediately, so you
 * judge a theme on the actual site rather than on a three-dot swatch. Leaving
 * the list puts the committed theme back; only a click persists.
 *
 * The swatch and the palette both come from `lib/themes.ts`, so a swatch can
 * never disagree with what selecting it does.
 */

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(DEFAULT_THEME);

  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    if (stored) setCurrent(stored);
  }, []);

  const theme = findTheme(current);

  return (
    <>
      <button
        type="button"
        className="chip"
        onClick={() => setOpen(true)}
        title="change theme"
        aria-haspopup="dialog"
      >
        <PaletteGlyph />
        {theme.name}
      </button>

      {open && (
        <ThemeDialog
          current={current}
          onClose={() => setOpen(false)}
          onPick={(id) => {
            setCurrent(id);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Apply a theme to the document without persisting it. */
function paint(id: string): void {
  const theme = findTheme(id);
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.dark = String(isDark(theme));
}

function ThemeDialog({
  current,
  onClose,
  onPick,
}: {
  current: string;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(current);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The dialog unmounts before the parent's new `current` reaches it, so the
  // cleanup below would otherwise repaint the theme the user just replaced.
  const committed = useRef(false);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? THEMES.filter((theme) => theme.name.includes(needle)) : THEMES;
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Closing without choosing puts the committed theme back; closing by
    // choosing leaves the new one alone.
    return () => {
      document.removeEventListener("keydown", onKey);
      if (!committed.current) paint(current);
    };
  }, [current, onClose]);

  // Bring the selected row into view when the list first opens.
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "center" });
  }, []);

  const preview = (id: string) => {
    setActive(id);
    paint(id);
  };

  function commit(id: string) {
    committed.current = true;
    paint(id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      // Private browsing: the choice still applies for this page view.
    }
    onPick(id);
  }

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="choose a theme"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-search">
          <SearchGlyph />
          <input
            ref={inputRef}
            className="sheet-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="theme..."
            aria-label="search themes"
            spellCheck={false}
          />
          <span className="micro">{matches.length}</span>
        </div>

        <div
          className="sheet-list"
          ref={listRef}
          onMouseLeave={() => {
            setActive(current);
            paint(current);
          }}
        >
          {matches.length === 0 ? (
            <p className="empty" style={{ padding: "2rem 1rem" }}>
              no theme called “{query}”
            </p>
          ) : (
            matches.map((theme) => (
              <button
                type="button"
                key={theme.id}
                className="sheet-row"
                data-selected={theme.id === current}
                data-active={theme.id === active}
                onMouseEnter={() => preview(theme.id)}
                onFocus={() => preview(theme.id)}
                onClick={() => commit(theme.id)}
              >
                <span className="tick" aria-hidden="true">
                  {theme.id === current ? "✓" : ""}
                </span>
                <span className="sheet-name">{theme.name}</span>
                <Swatch theme={theme} />
              </button>
            ))
          )}
        </div>

        <div className="sheet-foot">
          <span className="micro">hover to preview · click to keep</span>
          <span className="micro">
            <span className="kbd">esc</span> to close
          </span>
        </div>
      </div>
    </div>
  );
}

/** The theme's ground with its accent, muted and text colours on top. */
function Swatch({ theme }: { theme: Theme }) {
  return (
    <span className="swatch-pill" style={{ background: theme.bg }} aria-hidden="true">
      {[theme.main, theme.sub, theme.text].map((color, index) => (
        <span key={index} style={{ background: color }} />
      ))}
    </span>
  );
}

function PaletteGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-1 .8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3Z" />
      <circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

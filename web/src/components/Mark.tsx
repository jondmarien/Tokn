/**
 * The tokn mark: a token, bracketed.
 *
 * Drawn rather than loaded from `/logo.svg` so it inherits `currentColor`,
 * which means it follows whichever accent the reader has chosen instead of
 * being frozen to the default lime. An `<img>` could not do that.
 *
 * The favicon at `app/icon.svg` is deliberately a *different* drawing of the
 * same idea — a solid tile with the bracket knocked out. At 16px, against
 * browser chrome whose colour we cannot know, thin strokes grey out into
 * mush; a filled shape keeps its silhouette anywhere.
 */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flex: "none", color: "var(--main)" }}
    >
      <path
        d="M12 5H7a2.5 2.5 0 0 0-2.5 2.5v17A2.5 2.5 0 0 0 7 27h5"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M20 5h5a2.5 2.5 0 0 1 2.5 2.5v17A2.5 2.5 0 0 1 25 27h-5"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <rect x="13" y="13" width="6" height="6" rx="2" fill="currentColor" />
    </svg>
  );
}

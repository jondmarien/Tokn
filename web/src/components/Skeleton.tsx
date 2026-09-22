/**
 * The shape of a page, drawn before its data arrives.
 *
 * Every route here is dynamic, because the root layout reads the session. In
 * the App Router that means clicking a link starts a server request and the
 * browser keeps showing the *old* page until it answers — so a two second
 * render reads as two seconds of nothing happening, and people click again.
 *
 * A `loading.tsx` changes that completely. Next swaps this in the instant a
 * navigation begins, so the click registers immediately and the real content
 * streams in behind it. The server is no faster; the application stops feeling
 * broken while it works.
 *
 * These deliberately mirror the real layout rather than showing a spinner. A
 * skeleton in roughly the right shape means the page does not jump when the
 * content lands, and the eye has somewhere to rest in the meantime.
 */

export function SkeletonLine({
  width = "100%",
  height = "1rem",
}: {
  width?: string;
  height?: string;
}) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

/** A label above a big figure, the shape most blocks on this site take. */
export function SkeletonBlock({ rows = 3 }: { rows?: number }) {
  return (
    <section>
      <SkeletonLine width="7rem" height="0.75rem" />
      <div style={{ marginTop: "0.6rem" }}>
        <SkeletonLine width="11rem" height="2rem" />
      </div>
      <div style={{ display: "grid", gap: "0.85rem", marginTop: "1.5rem" }}>
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonLine key={i} height="0.75rem" width={`${100 - i * 12}%`} />
        ))}
      </div>
    </section>
  );
}

/** The leaderboard: a header strip, then rows. */
export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div style={{ display: "grid", gap: "0.9rem" }}>
      <SkeletonLine width="100%" height="1.6rem" />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonLine key={i} height="1.1rem" />
      ))}
    </div>
  );
}

/** Four headline figures across the top of a profile. */
export function SkeletonStats() {
  return (
    <section
      style={{
        display: "grid",
        gap: "1.5rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
      }}
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ display: "grid", gap: "0.5rem" }}>
          <SkeletonLine width="5rem" height="0.7rem" />
          <SkeletonLine width="7rem" height="1.7rem" />
        </div>
      ))}
    </section>
  );
}

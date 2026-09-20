import type { AvatarStyle } from "@/lib/prefs";

/**
 * A profile mark, in one of three styles.
 *
 *   auto    a gradient derived from the handle — the default, and the reason
 *           there is no upload flow, no storage and no broken image state
 *   initial the first character on a flat accent block
 *   github  the account's real picture, when one is linked
 *
 * The generated palette is deliberately near-neutral and takes its lightness
 * from the theme: a column of saturated circles is the loudest thing on a page,
 * and a dark mark on a white ground reads as a hole punched in the row.
 */

export function Avatar({
  handle,
  size = 40,
  style = "auto",
  url,
}: {
  handle: string;
  size?: number;
  style?: AvatarStyle;
  url?: string | null;
}) {
  if (style === "github" && url) {
    return (
      // A remote avatar, so plain <img>: no loader config, and a broken URL
      // simply renders as the empty circle rather than failing the page.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="avatar"
        src={url}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "cover" }}
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (style === "initial") {
    return (
      <span
        className="avatar"
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          background: "var(--main)",
          color: "var(--on-main)",
          display: "grid",
          placeItems: "center",
          fontSize: Math.round(size * 0.46),
          lineHeight: 1,
          fontWeight: 500,
          letterSpacing: "-0.03em",
        }}
      >
        {(handle.trim()[0] ?? "?").toUpperCase()}
      </span>
    );
  }

  const seed = hash(handle);
  const hue = seed % 360;
  const angle = (seed >> 8) % 360;
  const id = `av-${seed.toString(36)}`;

  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 40 40" role="presentation">
        <defs>
          <linearGradient id={id} gradientTransform={`rotate(${angle} 0.5 0.5)`}>
            <stop offset="0%" stopColor={`hsl(${(hue + 20) % 360} 13% var(--av-tint))`} />
            <stop offset="100%" stopColor={`hsl(${hue} 9% var(--av-base))`} />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill={`url(#${id})`} />
        <circle cx={12 + (seed % 7)} cy={14 + ((seed >> 3) % 6)} r={9} fill="#fff" opacity={0.07} />
      </svg>
    </span>
  );
}

/** FNV-1a. Small, stable, and good enough to scatter hues. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h);
}

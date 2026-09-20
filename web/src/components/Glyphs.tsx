/**
 * The interface icon set.
 *
 * One stroke weight, one 24-unit box, sized by the caller. Shared rather than
 * inlined per component so the same idea keeps the same mark: the plug in the
 * account menu and the plug in the footer are the same path, and stay that way
 * when one of them is redrawn.
 *
 * Brand marks (GitHub, X) are filled shapes and live in `SocialIcon`.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  focusable: "false" as const,
};

type GlyphProps = { size?: number };

const box = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  ...stroke,
});

export function PersonGlyph({ size = 13 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function PlugGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <path d="M9 3v5M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
      <path d="M12 17v4" />
    </svg>
  );
}

export function ChartGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <path d="M3 17l5-6 4 3 5-7" />
      <path d="M3 21h18" />
    </svg>
  );
}

export function FriendsGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19a6 6 0 0 1 12 0" />
      <path d="M16 6.5a3 3 0 0 1 0 5.5M17.5 19a6 6 0 0 0-2-4.2" />
    </svg>
  );
}

export function GlobeGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5a15 15 0 0 1 0 17 15 15 0 0 1 0-17Z" />
    </svg>
  );
}

export function CogGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </svg>
  );
}

export function ExitGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <path d="M10 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H10" />
      <path d="m16 15 4-3-4-3M20 12H9" />
    </svg>
  );
}

export function InfoGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.1" />
    </svg>
  );
}

export function DocGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <path d="M13.5 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8Z" />
      <path d="M13.5 3v5h5" />
    </svg>
  );
}

export function LockGlyph({ size = 14 }: GlyphProps) {
  return (
    <svg {...box(size)}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="1.6" />
      <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
    </svg>
  );
}

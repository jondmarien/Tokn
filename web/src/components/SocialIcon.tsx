import type { Provider } from "@/lib/links";

/** Brand glyphs for profile links. One flat path each, sized in `em`. */
export function SocialIcon({ provider, size = 15 }: { provider: Provider; size?: number }) {
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  switch (provider) {
    case "github":
      return (
        <svg {...shared} fill="currentColor">
          <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5Z" />
        </svg>
      );
    case "x":
      return (
        <svg {...shared} fill="currentColor">
          <path d="M17.53 3h3.06l-6.69 7.64L21.75 21h-6.16l-4.82-6.3L5.25 21H2.19l7.15-8.17L2.25 3h6.31l4.36 5.77L17.53 3Zm-1.07 16.14h1.7L7.62 4.77H5.8l10.66 14.37Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...shared} fill="currentColor">
          <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.64h.05a4.17 4.17 0 0 1 3.75-2.06c4.01 0 4.75 2.64 4.75 6.07V21h-4v-5.54c0-1.32-.03-3.02-1.84-3.02-1.85 0-2.13 1.44-2.13 2.93V21h-4V9Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...shared} fill="currentColor">
          <path d="M23 12s0-3.66-.46-5.41a2.87 2.87 0 0 0-2.02-2.03C18.76 4.1 12 4.1 12 4.1s-6.76 0-8.52.46A2.87 2.87 0 0 0 1.46 6.6C1 8.34 1 12 1 12s0 3.66.46 5.41a2.87 2.87 0 0 0 2.02 2.03c1.76.46 8.52.46 8.52.46s6.76 0 8.52-.46a2.87 2.87 0 0 0 2.02-2.03C23 15.66 23 12 23 12ZM9.8 15.3V8.7l5.7 3.3-5.7 3.3Z" />
        </svg>
      );
    case "twitch":
      return (
        <svg {...shared} fill="currentColor">
          <path d="M4.3 2 2 6.6v13.1h4.6V23l3.9-3.3h3L21 13V2H4.3Zm15.1 10.2-3.1 3.1h-3.9l-3 2.6v-2.6H5.1V3.7h14.3v8.5ZM15.5 7v4.9h-1.9V7h1.9Zm-5.1 0v4.9H8.5V7h1.9Z" />
        </svg>
      );
    case "bluesky":
      return (
        <svg {...shared} fill="currentColor">
          <path d="M12 10.8C10.9 8.67 7.9 4.68 5.1 2.7 2.43.8 1.4 1.13.74 1.44.01 1.79 0 3.02 0 3.75s.4 5.9.66 6.75c.86 2.8 3.82 3.74 6.55 3.44l.4-.05-.4.06c-4 .6-7.55 2.05-2.89 7.24 5.12 5.3 7.02-1.14 8-4.4.97 3.26 2.1 9.47 7.9 4.4 4.36-4.4 1.2-6.65-2.8-7.24l-.4-.06.4.05c2.73.3 5.69-.64 6.55-3.44.26-.85.66-6.02.66-6.75s-.01-1.96-.74-2.31c-.66-.31-1.69-.64-4.36 1.26C16.1 4.68 13.1 8.67 12 10.8Z" />
        </svg>
      );
    default:
      return (
        <svg
          {...shared}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
        </svg>
      );
  }
}

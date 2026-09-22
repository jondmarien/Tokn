/**
 * The project changelog, shown by the version chip in the footer.
 *
 * Held here rather than fetched from a git host: the notes should render with
 * no network, and a release is a deliberate act of writing rather than a dump
 * of every commit message. Newest first — the footer reads `[0]` for the
 * current version.
 */

export interface ReleaseNote {
  /** Grouped the way the entries read, not the way they were committed. */
  heading: "Features" | "Improvements" | "Fixes";
  items: string[];
}

export interface Release {
  version: string;
  date: string;
  summary?: string;
  notes: ReleaseNote[];
}

export const RELEASES: Release[] = [
  {
    version: "0.5.0",
    date: "2026-09-21",
    summary: "A setup flow, and a CLI that does more than count.",
    notes: [
      {
        heading: "Features",
        items: [
          "setup: a walkthrough after signing up — pick a handle, install the cli, connect a machine, add a passkey",
          "cli: tokn watch, a live cost meter for the session you are in",
          "cli: tokn projects, spend per repository, read locally and never uploaded",
          "cli: on npm, so npm install -g toknhq works",
          "account: download everything you have as csv or json",
          "profiles: what you could have spent less, and which single change is worth the most",
          "profiles: a subscription against the api-rate value of the work it carried",
          "stats: tokens per day, not only a running total",
          "sign in: passkeys first, above github",
        ],
      },
      {
        heading: "Improvements",
        items: [
          "the leaderboard reads a per-user rollup instead of scanning every usage row on every page view",
          "site-wide stats are cached for an hour, because each miss is a full scan",
          "prices load in one page and are shared across a request",
          "reads use a page size meant for reading rather than the write batch",
          "scanning shows a progress bar instead of a counter",
        ],
      },
      {
        heading: "Fixes",
        items: [
          "the connect step showed an expired code forever and never asked for a new one",
          "your own account page talked about you in the third person",
        ],
      },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-09-19",
    summary: "Themes, and two ways to keep yourself off the board.",
    notes: [
      {
        heading: "Features",
        items: [
          "themes: a picker in the footer with 57 palettes, previewed live on hover",
          "account: change your handle, twice, then it takes a word with support",
          "privacy: make a profile private, or stay public and opt out of being ranked",
          "footer: a version chip that opens these notes",
        ],
      },
      {
        heading: "Improvements",
        items: [
          "themes are generated from one catalogue, so a swatch cannot disagree with the palette it selects",
          "accents and generated avatars key off whether a theme is dark, not off a theme name",
        ],
      },
      {
        heading: "Fixes",
        items: [
          "profile pages never checked whether a profile was private — they do now",
          "the leaderboard did not filter unlisted accounts at all",
        ],
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-09-19",
    summary: "Make a profile your own.",
    notes: [
      {
        heading: "Features",
        items: [
          "profiles: pick an accent, an avatar style, your four headline figures, and which sections show and in what order",
          "profiles: link GitHub, X, LinkedIn or your own site — the icon is derived from the host",
          "stats: a site-wide page with the 30-day window, model and tool mixes, records and a sync feed",
        ],
      },
      {
        heading: "Improvements",
        items: [
          "usage is tracked per tool as well as per model",
          "tokens read as 848M rather than 848m",
        ],
      },
      {
        heading: "Fixes",
        items: [
          "charts and the activity grid pushed the profile wider than a phone viewport",
          "the link page hydrated with a mismatch on every load, from seeding a countdown with Date.now()",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-09-18",
    summary: "The board, and the CLI that feeds it.",
    notes: [
      {
        heading: "Features",
        items: [
          "leaderboard: rank by cost, tokens or requests over five windows",
          "cli: link a machine with a one-time code, then publish daily totals per model",
          "profiles: activity grid, spend over time, token and model breakdowns",
        ],
      },
      {
        heading: "Improvements",
        items: [
          "a sync replaces a day rather than adding to it, so a corrected scan heals a bad one",
          "cost is priced from a table the CLI downloads, so a new model needs no new release",
        ],
      },
      {
        heading: "Fixes",
        items: [
          "a second sync used to double every number on the board",
        ],
      },
    ],
  },
];

export const CURRENT_VERSION = RELEASES[0]?.version ?? "0.0.0";

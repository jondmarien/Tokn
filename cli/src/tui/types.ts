/**
 * The wire shapes served by `/api/cli/board`, `/profile`, `/friends`, `/site`.
 *
 * These mirror the server's types rather than importing them: the CLI ships as
 * a standalone package and must not take a build dependency on the website.
 * The cost of that choice is that a server-side rename lands here as a runtime
 * surprise instead of a compile error, so the views treat every optional field
 * as genuinely optional and render around what is missing.
 */

export type Period = "day" | "week" | "month" | "year" | "all";
export type Metric = "cost" | "tokens" | "requests";
export type FriendWindow = "all" | "30d" | "7d";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "day" },
  { key: "week", label: "week" },
  { key: "month", label: "month" },
  // Not a typo on the server's part: the `year` key is a 90-day window, and
  // the site labels it honestly. Copying the label keeps the two consistent.
  { key: "year", label: "3 months" },
  { key: "all", label: "all time" },
];

export const METRICS: { key: Metric; label: string }[] = [
  { key: "cost", label: "cost" },
  { key: "tokens", label: "tokens" },
  { key: "requests", label: "requests" },
];

export const FRIEND_WINDOWS: { key: FriendWindow; label: string }[] = [
  { key: "all", label: "all time" },
  { key: "30d", label: "30 days" },
  { key: "7d", label: "7 days" },
];

/* ------------------------------------------------------------------ board */

export interface BoardRow {
  rank: number;
  userId: string;
  handle: string;
  name: string | null;
  joined: string;
  billing: string;
  cost: number;
  tokens: number;
  requests: number;
  days: number;
  topModel: string | null;
  lastDay: string | null;
  isSelf: boolean;
  previousRank: number | null;
  /** Fourteen days of daily spend, oldest first, for the sparkline. */
  series: number[];
}

export interface BoardData {
  period: Period;
  metric: Metric;
  lookbackDays: number;
  totals: { cost: number; tokens: number; requests: number; users: number; registered: number };
  rows: BoardRow[];
  /** Your row when you are off the end of the board, so you always appear. */
  self: BoardRow | null;
  me: { id: string; handle: string };
  /** When the board's numbers were read. Absent from servers before hourly boards. */
  updatedAt?: string;
}

/* ---------------------------------------------------------------- profile */

export interface DayPoint {
  day: string;
  cost: number;
  tokens: number;
  requests: number;
  /** The day's tokens split by kind. Present since the per-day token chart. */
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** DayPoint already carries the token split, so this only adds the model. */
export interface ModelPoint extends DayPoint {
  model: string;
}

export interface UserStats {
  totals: { cost: number; tokens: number; requests: number; days: number };
  tokens: { input: number; output: number; cacheWrite: number; cacheRead: number };
  byDay: DayPoint[];
  byModel: ModelPoint[];
  byTool: { tool: string; cost: number; tokens: number; requests: number }[];
  firstDay: string | null;
  lastDay: string | null;
  streak: number;
  longestStreak: number;
  best: DayPoint | null;
}

export interface Anatomy {
  cost: { input: number; output: number; cacheWrite: number; cacheRead: number; total: number };
  tokens: {
    input: number;
    output: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
    cacheRead: number;
    total: number;
  };
  reuse: {
    ratio: number | null;
    cacheRead: number;
    cacheWrite: number;
    cacheShareOfCost: number;
  };
}

export interface ReuseBenchmark {
  ratio: number | null;
  median: number | null;
  percentile: number | null;
  cohort: number;
  headroomUsd: number | null;
}

export interface BurnRate {
  perDay: number;
  monthToDate: number;
  projected: number | null;
  daysRemaining: number;
}

export interface WhatIfRow {
  model: string;
  costUsd: number;
  deltaUsd: number;
  deltaPct: number;
  inputRate: number;
  outputRate: number;
  cacheReadRate: number;
  blendedRate: number;
}

export interface WhatIf {
  actualUsd: number;
  actualModels: string[];
  tokens: number;
  actualBlendedRate: number;
  rows: WhatIfRow[];
}

export interface Plan {
  provider?: string;
  plan?: string;
  kind?: string;
  monthlyUsd?: number | null;
}

export interface ProfileData {
  user: {
    handle: string;
    name: string | null;
    bio: string | null;
    createdAt: string;
    billing: string;
    links: { kind?: string; url: string; label?: string }[];
    plans: Plan[];
    isPublic: boolean;
    listed: boolean;
    own: boolean;
    friend: boolean;
  };
  rank: number | null;
  stats: UserStats;
  anatomy: Anatomy;
  benchmark: ReuseBenchmark;
  burn: BurnRate;
  whatIf: WhatIf;
}

/* ---------------------------------------------------------------- friends */

export interface Person {
  id: string;
  handle: string;
  name?: string;
  avatarUrl?: string;
}

export interface FriendRank {
  userId: string;
  handle: string;
  rank: number;
  value: number;
  isSelf: boolean;
  costUsd: number;
  tokens: number;
  requests: number;
  activeDays: number;
  topModel?: string | null;
  topTool?: string | null;
  lastSyncAt?: string | null;
  lastDay?: string | null;
}

export interface FriendsData {
  window: FriendWindow;
  metric: Metric;
  entries: FriendRank[];
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
}

/* ------------------------------------------------------------------- site */

export interface Highlight {
  handle: string;
  value: number;
  detail?: string;
}

export interface SiteStats {
  windowDays: number;
  users: { total: number; reporting: number; joinedThisWeek: number; activeInWindow: number };
  window: { cost: number; tokens: number; requests: number; daysWithUsage: number };
  allTime: { cost: number; tokens: number; requests: number; firstDay: string | null };
  byDay: DayPoint[];
  byModel: { model: string; cost: number; tokens: number; requests: number }[];
  byTool: { tool: string; cost: number; tokens: number; requests: number; users: number }[];
  records: {
    biggestDay: Highlight | null;
    mostRequests: Highlight | null;
    mostModels: Highlight | null;
  };
  recentSyncs: { handle: string; at: string }[];
}

export interface SiteData {
  stats: SiteStats;
  top: BoardRow[];
}

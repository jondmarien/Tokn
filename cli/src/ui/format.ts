/** Human-facing formatting helpers. */

/** 1234567 -> "1.2M". Keeps columns narrow so wide tables still fit 80 cols. */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1_000) return String(Math.round(n));
  if (abs < 1_000_000) return trim(n / 1_000) + "K";
  if (abs < 1_000_000_000) return trim(n / 1_000_000) + "M";
  return trim(n / 1_000_000_000) + "B";
}

function trim(n: number): string {
  // One decimal place, but drop a trailing ".0" so "5.0M" reads as "5M".
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** 1234567 -> "1,234,567" */
export function fullNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Money. Sub-cent amounts still need to be distinguishable from zero — a single
 * cheap request should not render as "$0.00" — so we widen the precision as the
 * value shrinks.
 */
export function usd(n: number): string {
  if (n === 0) return "$0.00";
  const abs = Math.abs(n);
  if (abs < 0.01) return "$" + n.toFixed(4);
  if (abs < 1) return "$" + n.toFixed(3);
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * The website's three money scales, so the terminal reads the same.
 *
 * The site does not have one money format, it has three, and each is used
 * somewhere specific: the board and headline stats always show cents, the
 * cost-anatomy panel drops them above $100, and the stats page drops them
 * above $1,000. Rendering all of them with one adaptive formatter is the kind
 * of small divergence that makes someone comparing two screens wonder which
 * one is wrong, so the split is reproduced rather than smoothed over.
 *
 * `usd` above stays as it is: it serves the scan and sync output, where the
 * extra precision on sub-cent figures is the point.
 */

/** Always two decimals. The site's `money(n, 2)`: board and headline stats. */
export function money2(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** The site's default `money(n)`: whole dollars from $1,000 up. Stats page. */
export function money(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n >= 1000) return "$" + Math.round(n).toLocaleString("en-US");
  if (n >= 1) return "$" + n.toFixed(2);
  if (n === 0) return "$0.00";
  return "$" + n.toFixed(3);
}

/** The cost-anatomy panel's scale: whole dollars from $100 up. */
export function anatomyUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n >= 100) return "$" + Math.round(n).toLocaleString("en-US");
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(3);
}

export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function pluralize(n: number, one: string, many = one + "s"): string {
  return n === 1 ? one : many;
}

/** Shorten a model id for display: "claude-opus-5" -> "opus-5". */
export function shortModel(id: string): string {
  return id.replace(/^claude-/, "");
}

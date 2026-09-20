import { bold, cyan, dim, gray, padEnd, padStart, yellow } from "../../ui/ansi.js";
import { compactNumber, fullNumber, money2, shortModel } from "../../ui/format.js";
import { highlightRow, label, rule, scrollHint, truncate, viewport } from "../../ui/widgets.js";
import {
  FRIEND_WINDOWS,
  METRICS,
  type FriendRank,
  type FriendsData,
  type Metric,
} from "../types.js";

/**
 * Your friends board and roster.
 *
 * A roster, not a ranking: it includes you, and it includes friends who have
 * never synced. The web panel shows those with an explicit "never synced"
 * rather than dropping them, because a friend you just added vanishing from
 * the list reads as the add having failed. Same rule here.
 *
 * Read-only. The web panel can add, accept and remove people; this shows who
 * is waiting so you know to go and deal with it, and says where.
 */

export function render(data: FriendsData, width: number, cursor: number, height: number): string[] {
  const out: string[] = [];
  const inner = Math.max(30, width - 4);
  const push = (s = "") => out.push(s ? "  " + s : "");

  push();
  push(
    segmented("rank by", METRICS, data.metric) +
      dim("   m") +
      "    " +
      segmented("window", FRIEND_WINDOWS, data.window) +
      dim("   w"),
  );
  push();

  /* -------------------------------------------------------- pending */

  if (data.incoming.length > 0) {
    push(yellow(`waiting on you · ${data.incoming.length}`));
    for (const p of data.incoming) {
      push("  " + cyan(`@${p.handle}`) + dim(p.name ? `  ${p.name}` : ""));
    }
    push(dim("  accept at /account/friends on the site."));
    push();
  }

  if (data.outgoing.length > 0) {
    push(dim(`waiting on them · ${data.outgoing.length}`));
    for (const p of data.outgoing) push("  " + dim(`@${p.handle}`));
    push();
  }

  /* ---------------------------------------------------------- board */

  if (data.entries.length <= 1) {
    push(label("your board"));
    push();
    push(dim("Nobody here yet. Add someone by handle at /account/friends,"));
    push(dim("then their numbers show up here."));
    return out;
  }

  push(
    label("your board") +
      dim(`   ${data.friends.length} ${data.friends.length === 1 ? "friend" : "friends"}`),
  );
  push();

  const w = { rank: 4, user: Math.min(24, Math.max(14, inner - 44)), value: 12, days: 6, model: 14 };
  push(
    dim(
      padStart("#", w.rank) +
        "  " +
        padEnd("user", w.user) +
        padStart(data.metric, w.value) +
        padStart("days", w.days) +
        "  " +
        padEnd("model", w.model),
    ),
  );
  push(rule(inner));

  const body = Math.max(3, height - out.length - 3);
  const { slice, offset } = viewport(data.entries, cursor, body);

  for (const [i, row] of slice.entries()) {
    push(line(row, w, data.metric, offset + i === cursor));
  }

  const hint = scrollHint(offset, slice.length, data.entries.length);
  if (hint) push(padStart(hint, inner));

  return out;
}

export function handleAt(data: FriendsData, cursor: number): string | null {
  return data.entries[cursor]?.handle ?? null;
}

export function rowCount(data: FriendsData): number {
  return data.entries.length;
}

/* ----------------------------------------------------------- internals */

interface Widths {
  rank: number;
  user: number;
  value: number;
  days: number;
  model: number;
}

function line(row: FriendRank, w: Widths, metric: Metric, active: boolean): string {
  // A friend who has never synced has a zeroed rollup, not a real zero. Saying
  // "$0.00" would read as "they spent nothing", which is a different claim.
  const never = !row.lastSyncAt;
  const who = `@${row.handle}` + (row.isSelf ? dim(" ·you") : "");

  const value = never
    ? dim("never synced")
    : metric === "cost"
      ? money2(row.costUsd)
      : metric === "tokens"
        ? compactNumber(row.tokens)
        : fullNumber(row.requests);

  const text =
    padStart(String(row.rank), w.rank) +
    "  " +
    padEnd(truncate(row.isSelf ? cyan(who) : who, w.user), w.user) +
    padStart(value, w.value) +
    dim(padStart(never ? "—" : String(row.activeDays), w.days)) +
    "  " +
    dim(padEnd(truncate(row.topModel ? shortModel(row.topModel) : "—", w.model), w.model));

  return active ? highlightRow(text) : text;
}

function segmented<T extends string>(
  name: string,
  options: { key: T; label: string }[],
  active: T,
): string {
  const rendered = options
    .map((o) => (o.key === active ? bold(o.label) : dim(o.label)))
    .join(dim(" · "));
  return gray(padEnd(name, 8)) + rendered;
}

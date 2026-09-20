import type { ApiClient } from "../core/api.js";
import { openBrowser } from "../core/browser.js";
import { ApiError } from "../core/api.js";
import { bold, cyan, dim, gray, padEnd, red, visibleWidth, yellow } from "../ui/ansi.js";
import { renderWordmark } from "../ui/logo.js";
import { rule, truncate } from "../ui/widgets.js";
import type { App, AppContext, Key, Size } from "../ui/screen.js";
import * as boardView from "./views/board.js";
import * as friendsView from "./views/friends.js";
import * as profileView from "./views/profile.js";
import * as siteView from "./views/site.js";
import {
  FRIEND_WINDOWS,
  METRICS,
  PERIODS,
  type BoardData,
  type FriendWindow,
  type FriendsData,
  type Metric,
  type Period,
  type ProfileData,
  type SiteData,
} from "./types.js";

/**
 * The terminal dashboard: the website, navigable with a keyboard.
 *
 * Four tabs matching four pages, plus profile drill-down from any row. The one
 * rule the whole thing is built around is that it can only read. A device
 * token exists to upload token counts; letting it rename an account or accept
 * a friend request from a machine that may be a shared build box is authority
 * it was never granted. So there is no write path here — not disabled in the
 * UI, absent from the API.
 *
 * Each tab keeps its own data, cursor and scroll position, so tabbing away and
 * back returns you to where you were rather than to the top of a reloaded
 * list. Data is fetched once per tab and only refetched when a filter changes
 * or you ask for it with `r`.
 */

type Tab = "board" | "you" | "friends" | "site";

const TABS: { key: Tab; label: string }[] = [
  { key: "board", label: "leaderboard" },
  { key: "you", label: "profile" },
  { key: "friends", label: "friends" },
  { key: "site", label: "stats" },
];

/** A fetch that has not happened yet, is happening, failed, or succeeded. */
interface Async<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  hint: string | null;
  /**
   * Which request this slot is waiting for.
   *
   * Cycling a filter twice quickly used to be swallowed: the second `load`
   * saw one already in flight and returned, so the header showed the new
   * period against the old numbers, permanently. Every request now takes a
   * ticket, the latest ticket wins, and results that arrive out of order are
   * dropped rather than overwriting fresher ones.
   */
  seq: number;
}

const idle = <T>(): Async<T> => ({
  data: null,
  loading: false,
  error: null,
  hint: null,
  seq: 0,
});

export class Dashboard implements App {
  private tab: Tab = "board";

  private board = idle<BoardData>();
  private profile = idle<ProfileData>();
  private friends = idle<FriendsData>();
  private site = idle<SiteData>();

  private period: Period = "all";
  private metric: Metric = "cost";
  private friendWindow: FriendWindow = "all";
  private friendMetric: Metric = "cost";

  private cursor: Record<Tab, number> = { board: 0, you: 0, friends: 0, site: 0 };

  /**
   * Whose profile the `profile` tab is showing. Null means your own.
   *
   * The stack is what makes Escape mean "back" rather than "quit": opening a
   * profile from the board pushes, Escape pops, and an empty stack returns to
   * the tab you came from.
   */
  private viewing: string | null = null;
  private trail: { tab: Tab; handle: string | null }[] = [];

  private help = false;
  private helpScroll = 0;

  /**
   * Geometry and content length from the last frame, so scrolling agrees with
   * what was actually drawn.
   *
   * These used to be re-derived inside `limit()` from a guessed chrome height,
   * which disagreed with the real one by three lines: the bottom of a long
   * profile was unreachable, and the last page scrolled into blank space.
   * Measuring the frame is the only way to keep them in step.
   */
  private viewHeight = 20;
  private bodyLength = 0;
  private status: string | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly host: string,
    /** From local config, which can be out of date — see `who`. */
    private readonly storedHandle: string,
  ) {}

  /**
   * The handle to show as "you".
   *
   * The stored one is whatever this machine was linked as, and a rename on the
   * site does not reach back to it — so after changing handle the config says
   * the old name indefinitely. The server knows the current one, so prefer it
   * and fall back only until the first response arrives.
   */
  private get handle(): string {
    return this.board.data?.me.handle ?? this.storedHandle;
  }

  /**
   * Load the first tab before the screen is taken over.
   *
   * Deliberately not inside the render loop: a revoked token or an unreachable
   * host should print an ordinary error into the user's scrollback, not flash
   * a full-screen app that dies on its first frame.
   */
  async prefetch(): Promise<void> {
    await this.load("board", null);
  }

  /* ------------------------------------------------------------ render */

  frame(size: Size): string {
    const { cols, rows } = size;
    const width = cols - 1;
    const lines: string[] = [];

    /* ----------------------------------------------------------- chrome */

    const title = bold("tokn") + dim(`  ${this.host.replace(/^https?:\/\//, "")}`);
    const who = cyan(`@${this.handle}`);
    lines.push(
      " " +
        title +
        " ".repeat(Math.max(1, width - visibleWidth(title) - visibleWidth(who) - 2)) +
        who,
    );

    const tabBar = TABS.map((t, i) => {
      const text = `${i + 1} ${t.label}`;
      return t.key === this.tab ? bold(cyan(text)) : dim(text);
    }).join(dim("   "));
    lines.push(" " + tabBar);
    lines.push(rule(width));

    /* ---------------------------------------------------------- content */

    const footerHeight = 2;
    const height = Math.max(3, rows - lines.length - footerHeight);
    const body = this.help ? helpLines() : this.content(width, height);
    this.viewHeight = height;
    this.bodyLength = body.length;

    // A scroll view is a long document the cursor pages through; a list view
    // windows itself and gets the cursor as a selection instead.
    const from = this.help ? this.helpScroll : this.cursor[this.tab];
    const scrolled = this.scrolls() ? body.slice(from, from + height) : body.slice(0, height);

    for (let i = 0; i < height; i++) lines.push(clip(scrolled[i] ?? "", width));

    /* ---------------------------------------------------------- footer */

    lines.push(rule(width));
    lines.push(" " + clip(this.footer(), width - 1));

    // Clip everything, chrome included, rather than trusting each producer to
    // respect the width. One line over the edge wraps, and a single wrapped
    // line pushes every line below it down by one — which is the staircase
    // that makes a whole frame look shredded.
    return lines.map((line) => clip(line, width)).join("\n");
  }

  private content(cols: number, height: number): string[] {
    switch (this.tab) {
      case "board":
        return this.pane(this.board, (d) => boardView.render(d, cols, this.cursor.board, height));
      case "you":
        return this.pane(this.profile, (d) => profileView.render(d, cols));
      case "friends":
        return this.pane(this.friends, (d) =>
          friendsView.render(d, cols, this.cursor.friends, height),
        );
      case "site":
        return this.pane(this.site, (d) => siteView.render(d, cols));
    }
  }

  private pane<T>(state: Async<T>, draw: (data: T) => string[]): string[] {
    if (state.error) {
      const out = ["", "  " + red(state.error)];
      if (state.hint) out.push("  " + dim(state.hint));
      out.push("", "  " + dim("r to retry"));
      return out;
    }
    // Keep showing the previous data while a refresh is in flight: blanking the
    // screen on every filter change is what makes a TUI feel like a web page
    // with a slow connection.
    if (state.data) return draw(state.data);
    if (state.loading) return ["", "  " + dim("loading…")];
    return ["", "  " + dim("nothing here yet")];
  }

  private footer(): string {
    if (this.status) return yellow(this.status);
    if (this.help) return dim("? or esc to close");

    // Refreshing keeps the old numbers on screen rather than blanking them,
    // which means nothing else on the frame says a fetch is happening. Without
    // this line, pressing `p` on a slow connection looks like a dead key.
    const slot = this.state(this.tab);
    if (slot.loading && slot.data) return dim("refreshing…");

    const keys: string[] = [];
    if (this.scrolls()) keys.push("↑↓ scroll");
    else keys.push("↑↓ move", "⏎ profile");

    if (this.tab === "board") keys.push("p period", "m metric");
    if (this.tab === "friends") keys.push("w window", "m metric");
    if (this.trail.length > 0) keys.push("esc back");

    keys.push("r refresh", "o browser", "? help", "q quit");
    return dim(keys.join(gray("  ·  ")));
  }

  /** Scroll views page through a document; list views select a row. */
  private scrolls(): boolean {
    return this.help || this.tab === "you" || this.tab === "site";
  }

  /* -------------------------------------------------------------- keys */

  async key(key: Key, ctx: AppContext): Promise<boolean> {
    // Any keystroke clears a transient message, so it never outlives the thing
    // it was describing.
    const hadStatus = this.status !== null;
    this.status = null;

    // Ctrl-C reports an interrupted program the way a shell expects; `q` is an
    // ordinary, successful quit.
    if (key.ctrl && key.name === "c") {
      ctx.screen.exit(130);
      return false;
    }
    if (key.name === "q") {
      ctx.screen.exit(0);
      return false;
    }

    if (key.name === "?") {
      this.help = !this.help;
      this.helpScroll = 0;
      return true;
    }

    if (this.help) {
      // While help is up it owns the screen; only closing it is meaningful.
      if (key.name === "escape" || key.name === "return" || key.name === "enter") {
        this.help = false;
        return true;
      }
      return this.move(key) || hadStatus;
    }

    /* ----------------------------------------------------- navigation */

    const digit = TABS.findIndex((_, i) => key.name === String(i + 1));
    if (digit >= 0) return this.go(TABS[digit]!.key, ctx);

    if (key.name === "tab") {
      const at = TABS.findIndex((t) => t.key === this.tab);
      const next = TABS[(at + (key.shift ? TABS.length - 1 : 1)) % TABS.length]!;
      return this.go(next.key, ctx);
    }

    if (key.name === "escape" || key.name === "backspace") {
      const back = this.trail.pop();
      if (!back) return hadStatus;
      this.tab = back.tab;
      if (back.handle !== this.viewing) {
        this.viewing = back.handle;
        void this.load("you", ctx, true);
      }
      return true;
    }

    if (key.name === "enter" || key.name === "return") return this.open(ctx);

    /* -------------------------------------------------------- filters */

    if (key.name === "p" && this.tab === "board") {
      this.period = cycle(PERIODS, this.period);
      void this.load("board", ctx, true);
      return true;
    }

    if (key.name === "m" && (this.tab === "board" || this.tab === "friends")) {
      if (this.tab === "board") {
        this.metric = cycle(METRICS, this.metric);
        void this.load("board", ctx, true);
      } else {
        this.friendMetric = cycle(METRICS, this.friendMetric);
        void this.load("friends", ctx, true);
      }
      return true;
    }

    if (key.name === "w" && this.tab === "friends") {
      this.friendWindow = cycle(FRIEND_WINDOWS, this.friendWindow);
      void this.load("friends", ctx, true);
      return true;
    }

    if (key.name === "r") {
      void this.load(this.tab, ctx, true);
      return true;
    }

    if (key.name === "o") {
      // The terminal and the website are the same pages; this is the door
      // between them. The address is shown as well as opened, because on a
      // headless or remote machine the launch quietly does nothing.
      const url = this.url();
      openBrowser(url);
      this.status = `opening ${url}`;
      return true;
    }

    return this.move(key) || hadStatus;
  }

  /* -------------------------------------------------------- movement */

  private move(key: Key): boolean {
    const at = () => (this.help ? this.helpScroll : this.cursor[this.tab]);
    const step = (delta: number) => {
      const next = Math.max(0, Math.min(at() + delta, this.limit()));
      if (next === at()) return false;
      if (this.help) this.helpScroll = next;
      else this.cursor[this.tab] = next;
      return true;
    };

    switch (key.name) {
      case "up":
      case "k":
        return step(-1);
      case "down":
      case "j":
        return step(1);
      case "pageup":
        return step(-Math.max(1, this.viewHeight - 2));
      case "pagedown":
      case "space":
        return step(Math.max(1, this.viewHeight - 2));
      case "home":
        return step(-Number.MAX_SAFE_INTEGER);
      case "end":
        return step(Number.MAX_SAFE_INTEGER);
      case "g":
        // Shift-G reaches us as "g" with the shift flag, never as "G".
        return step(key.shift ? Number.MAX_SAFE_INTEGER : -Number.MAX_SAFE_INTEGER);
      default:
        return false;
    }
  }

  /**
   * The furthest the cursor may travel.
   *
   * For a list that is the last row. For a scrolled document it is one screen
   * short of the end, so the last page stays full rather than scrolling the
   * content off the top into blank space.
   */
  private limit(): number {
    if (this.tab === "board" && !this.help) {
      return Math.max(0, (this.board.data ? boardView.rowCount(this.board.data) : 1) - 1);
    }
    if (this.tab === "friends" && !this.help) {
      return Math.max(0, (this.friends.data ? friendsView.rowCount(this.friends.data) : 1) - 1);
    }

    // Scroll views stop one screen short of the end, so the final page stays
    // full instead of scrolling the content up into blank space. Both numbers
    // come from the last frame, so this cannot drift from what was drawn.
    return Math.max(0, this.bodyLength - this.viewHeight);
  }

  /* ----------------------------------------------------- transitions */

  private async go(tab: Tab, ctx: AppContext): Promise<boolean> {
    if (this.tab === tab) return false;
    this.tab = tab;
    // Switching to your own profile from the tab bar leaves whoever you were
    // looking at, which is what pressing "profile" should mean.
    if (tab === "you" && this.viewing !== null) {
      this.viewing = null;
      this.trail = [];
      void this.load("you", ctx, true);
      return true;
    }
    if (!this.state(tab).data && !this.state(tab).loading) void this.load(tab, ctx);
    return true;
  }

  /** Enter: open the profile under the cursor. */
  private async open(ctx: AppContext): Promise<boolean> {
    let handle: string | null = null;
    if (this.tab === "board" && this.board.data) {
      handle = boardView.handleAt(this.board.data, this.cursor.board);
    } else if (this.tab === "friends" && this.friends.data) {
      handle = friendsView.handleAt(this.friends.data, this.cursor.friends);
    }
    if (!handle) return false;

    this.trail.push({ tab: this.tab, handle: this.viewing });
    this.viewing = handle === this.handle ? null : handle;
    this.tab = "you";
    this.cursor.you = 0;
    void this.load("you", ctx, true);
    return true;
  }

  private state(tab: Tab): Async<unknown> {
    return tab === "board"
      ? this.board
      : tab === "you"
        ? this.profile
        : tab === "friends"
          ? this.friends
          : this.site;
  }

  /* --------------------------------------------------------- fetching */

  private async load(tab: Tab, ctx: AppContext | null, force = false): Promise<void> {
    const slot = this.state(tab) as Async<unknown>;
    // An unforced load is a first fill; once there is data it is a no-op. A
    // forced one always goes, even over a request already in flight.
    if (slot.data && !force) return;
    if (slot.loading && !force) return;

    const seq = ++slot.seq;
    const current = () => seq === slot.seq;

    slot.loading = true;
    slot.error = null;
    slot.hint = null;
    ctx?.render();

    try {
      switch (tab) {
        case "board": {
          const data = await this.api.board(this.period, this.metric);
          if (!current()) return;
          this.board.data = data;
          this.cursor.board = Math.min(this.cursor.board, Math.max(0, data.rows.length - 1));
          break;
        }
        case "you": {
          const data = await this.api.profile(this.viewing ?? undefined);
          if (!current()) return;
          this.profile.data = data;
          break;
        }
        case "friends": {
          const data = await this.api.friends(this.friendWindow, this.friendMetric);
          if (!current()) return;
          this.friends.data = data;
          this.cursor.friends = Math.min(
            this.cursor.friends,
            Math.max(0, data.entries.length - 1),
          );
          break;
        }
        case "site": {
          const data = await this.api.site();
          if (!current()) return;
          this.site.data = data;
          break;
        }
      }
    } catch (error) {
      if (ctx === null) throw error;
      if (!current()) return;
      const api = error instanceof ApiError ? error : null;
      slot.error = api?.message ?? (error as Error).message;
      slot.hint = api?.hint ?? null;

      // A 404 on a profile is the privacy rule doing its job, not a failure to
      // explain away: a private profile and a missing one look identical on
      // purpose, so the message must not distinguish them either.
      if (tab === "you" && api?.status === 404) {
        slot.error = "no such profile";
        slot.hint = "it may not exist, or may not be public.";
      }
    } finally {
      // A superseded request must not clear the spinner for the one that
      // replaced it, or the footer stops saying `refreshing…` mid-fetch.
      if (current()) {
        slot.loading = false;
        ctx?.render();
      }
    }
  }

  /** The web address of whatever is currently on screen. */
  private url(): string {
    const base = this.host.replace(/\/+$/, "");
    switch (this.tab) {
      case "board":
        return `${base}/?period=${this.period}&metric=${this.metric}`;
      case "you":
        return `${base}/profile/${this.viewing ?? this.handle}`;
      case "friends":
        return `${base}/account/friends`;
      case "site":
        return `${base}/stats`;
    }
  }
}

/* --------------------------------------------------------------- helpers */

function cycle<T extends string>(options: { key: T }[], current: T): T {
  const at = options.findIndex((o) => o.key === current);
  return options[(at + 1) % options.length]!.key;
}

/** Clip a line to the terminal width so it can never wrap and shift the frame. */
function clip(line: string, cols: number): string {
  return visibleWidth(line) > cols ? truncate(line, cols) : line;
}

function helpLines(): string[] {
  const row = (keys: string, what: string) => "    " + bold(padEnd(keys, 14)) + dim(what);
  return [
    "",
    "  " + renderWordmark(),
    "",
    "  " + dim("the leaderboard, in your terminal. read-only."),
    "",
    "  " + bold("moving around"),
    row("1 2 3 4", "jump to a tab"),
    row("tab", "next tab, shift-tab for previous"),
    row("↑ ↓ / j k", "move or scroll"),
    row("g / G", "top / bottom"),
    row("pgup pgdn", "a screen at a time"),
    row("⏎", "open the profile under the cursor"),
    row("esc", "back to where you came from"),
    "",
    "  " + bold("filtering"),
    row("p", "period: day, week, month, 3 months, all"),
    row("m", "rank by cost, tokens or requests"),
    row("w", "friends window: all, 30 days, 7 days"),
    "",
    "  " + bold("other"),
    row("r", "refresh this tab"),
    row("o", "show the web address for this view"),
    row("? ", "this help"),
    row("q", "quit"),
    "",
    "  " + bold("what this cannot do"),
    "    " + dim("Change anything. Your handle, profile, friends and"),
    "    " + dim("settings are editable on the site only — a linked"),
    "    " + dim("machine can upload usage and read, nothing more."),
    "",
  ];
}

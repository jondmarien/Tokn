import type { Metadata } from "next";
import Link from "next/link";
import { Terminal } from "@/components/Terminal";
import { SOURCE_URL, X_HANDLE, X_URL } from "@/lib/site";
import { compact, count, money, niceDay } from "@/lib/format";
import { siteStats } from "@/lib/site-stats";

/**
 * About.
 *
 * One column, read top to bottom, in sections. The site's other pages are
 * instruments; this one is prose, and the only numbers on it are the ones that
 * say how much has actually been measured. They are live rather than written
 * down, because a page claiming the project measures things should not carry a
 * figure someone typed in by hand.
 */

export const metadata: Metadata = { title: "About — tokn" };

export const dynamic = "force-dynamic";

const PAYLOAD = `{
  "day": "2026-09-18",
  "tool": "claude-code",
  "model": "claude-opus-5",
  "requests": 214,
  "input": 41233,
  "output": 88120,
  "cacheWrite1h": 1904221,
  "cacheRead": 9241882,
  "costUsd": 12.41,
  "fast": false
}`;

const STEPS = [
  {
    head: "it reads the logs you already have",
    body: "Claude Code, Codex, Cursor and the rest each write a session record to disk: model, token counts, timestamps. The scan is local and read-only. Nothing is uploaded at this stage, and `tokn scan` prints the same table without an account at all.",
  },
  {
    head: "it prices them at published rates",
    body: "Every model call is costed against published rates, broken out by input, output, cache write and cache read. Cache is where the money goes on a long session: a five minute write costs 1.25x the input rate, a one hour write 2x, and a read a tenth, which is why a token count on its own is a poor guide to what something cost.",
  },
  {
    head: "it uploads one row per day, per model",
    body: "That row is the whole payload. A sync replaces the days it covers instead of adding to them, so a corrected scan heals a bad one and running it twice changes nothing.",
  },
];

export default async function AboutPage() {
  const stats = await siteStats(30);

  const figures: { k: string; v: string }[] = [
    { k: "tracked spend", v: money(stats.allTime.cost, 0) },
    { k: "tokens measured", v: compact(stats.allTime.tokens) },
    { k: "model calls", v: count(stats.allTime.requests) },
    { k: "developers", v: count(stats.users.total) },
    { k: "have synced", v: count(stats.users.reporting) },
    { k: "models seen", v: count(stats.allTime.models) },
    { k: "days recorded", v: count(stats.allTime.days) },
    {
      k: "measuring since",
      v: stats.allTime.firstDay ? niceDay(stats.allTime.firstDay) : "—",
    },
  ];

  return (
    <div className="prose-page">
      <section>
        <h1 className="title">about</h1>
        <p className="lede" style={{ marginTop: "0.75rem" }}>
          tokn measures what AI coding actually costs. Not a survey and not an
          estimate: a command line tool reads the session logs your editor
          already writes, prices them against published API rates, and posts the
          daily total here.
        </p>
      </section>

      <section>
        <h2 className="block-label">what it is</h2>
        <div className="prose">
          <p>
            Everyone has a number in their head for what they spend on AI
            tooling, and almost nobody has checked it. The tools do keep
            records. Every session leaves a log on disk with the model, the
            token counts and the time. Those files sit there unread.
          </p>
          <p>
            tokn reads them. It works out what each day would cost at raw API
            rates, uploads that one figure per model per day, and ranks it. The
            board is not a poll of what people think they spend. Every row on it
            came off a machine that ran a scan.
          </p>
          <p>
            The project has no opinion about whether you are spending too much.
            It is a measuring instrument, and the useful thing about one of
            those is that it disagrees with you sometimes.
          </p>
        </div>
      </section>

      <section className="bleed">
        <h2 className="block-label">how much has been measured</h2>
        <div className="stats about-figures">
          {figures.map((figure) => (
            <div className="stat" key={figure.k}>
              <span className="k">{figure.k}</span>
              <span className="v">{figure.v}</span>
            </div>
          ))}
        </div>
        <p className="micro" style={{ marginTop: "1.5rem" }}>
          All time, read live when this page loaded. The{" "}
          <Link href="/stats" className="main link">
            stats page
          </Link>{" "}
          breaks the same numbers down by day, model and tool.
        </p>
      </section>

      <section>
        <h2 className="block-label">how it works</h2>
        <Terminal
          commands={["npm install -g tokn", "tokn link", "tokn sync"]}
        />

        <ol className="steps">
          {STEPS.map((step, index) => (
            <li key={step.head}>
              <span className="steps-n">{index + 1}</span>
              <div>
                <p className="steps-head">{step.head}</p>
                <p className="steps-body">{renderTicks(step.body)}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="micro" style={{ marginTop: "1.25rem" }}>
          <span className="kbd">tokn status</span> shows what is connected.{" "}
          <span className="kbd">tokn unlink</span> disconnects a machine, and so
          does revoking it from your{" "}
          <Link href="/account" className="main link">
            account
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="block-label">what leaves your machine</h2>
        <div className="prose">
          <p>This, once a day, per model. Nothing else.</p>
        </div>
        <pre className="payload">{PAYLOAD}</pre>
        <div className="prose">
          <p>
            No prompts, no completions, no file paths, no project or repository
            names. The aggregation happens on your machine before anything is
            sent, so there is nothing finer grained for the server to leak. You
            can read the exact rows a sync would upload with{" "}
            <span className="kbd">tokn scan</span> before you ever link an
            account.
          </p>
          <p>
            A profile can be made private, or kept public but taken off the
            board, in{" "}
            <Link href="/account/settings" className="main link">
              settings
            </Link>
            . Deleting an account removes the profile and every usage row with
            it, immediately and without a grace period.
          </p>
        </div>
      </section>

      <section>
        <h2 className="block-label">what the number means</h2>
        <div className="prose">
          <p>
            The figure on your row is what your usage would have cost at raw API
            rates. If you pay per token, that is close to your bill. If you are
            on a subscription, it is not a bill at all: it is how much work you
            pushed through, valued at what that work costs when nobody is
            subsidising it. Rows on a plan carry a{" "}
            <span className="tag">plan</span> tag so the number reads correctly.
          </p>
          <p>
            You can also list the subscriptions and API accounts you pay for on
            your profile, and see what the same work would have cost at API
            rates. That part is self reported, and the profile says so.
          </p>
        </div>
      </section>

      <section>
        <h2 className="block-label">what it does not measure</h2>
        <ul className="plain-list">
          <li>
            Anything from before you installed it, unless the logs are still on
            disk. The scan reads what is there; it cannot reconstruct what has
            been cleaned up.
          </li>
          <li>
            Work done in a browser chat window. There is no local session log to
            read, so none of it counts.
          </li>
          <li>
            Tools that keep no usable record. Support is per tool, and a tool
            that writes nothing down cannot be measured by reading disks.
          </li>
          <li>
            What you were actually billed. That is between you and your
            provider; this only knows published rates and token counts.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="block-label">the rest</h2>
        <div className="prose">
          <p>
            Terminal and desktop sessions both count. Records duplicated by a
            resumed session are ignored, so a rescan never inflates a total.
            Handles can be changed twice; after that it takes a word with
            support, which keeps profile links worth something.
          </p>
          <p>
            The{" "}
            <Link href="/terms" className="main link">
              terms
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" className="main link">
              privacy policy
            </Link>{" "}
            are both short and say what they mean. If a number here looks wrong,
            it is worth reporting: being wrong in public is the only real risk
            this project runs.
          </p>
          <p>
            The source is on{" "}
            <a
              className="main link"
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            , which is where bugs and bad numbers should go. Updates are on{" "}
            <a
              className="main link"
              href={X_URL}
              target="_blank"
              rel="noreferrer"
            >
              {X_HANDLE}
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * Backticks to `.kbd`, so the step copy above can stay a plain string instead
 * of carrying markup for the sake of two command names.
 */
function renderTicks(text: string): React.ReactNode[] {
  return text.split(/`([^`]+)`/g).map((part, index) =>
    index % 2 === 1 ? (
      <span className="kbd" key={index}>
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

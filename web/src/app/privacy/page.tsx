import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy — tokn" };

const PAYLOAD = `{
  "day": "2026-09-18",
  "tool": "claude-code",
  "model": "claude-opus-5",
  "requests": 214,
  "input": 41233,
  "output": 88120,
  "cacheWrite5m": 0,
  "cacheWrite1h": 1904221,
  "cacheRead": 9241882,
  "costUsd": 12.41,
  "fast": false
}`;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="privacy"
      summary="What leaves your machine, what we store, and how to get rid of it."
      updated="18 September 2026"
    >
      <Section heading="the short version">
        <p>
          tokn uploads counts. One row per day, per tool, per model. No prompts,
          no replies, no code, no file paths, no repository or project names, no
          branch names. We do not run analytics or advertising, and we do not
          sell anything to anybody.
        </p>
      </Section>

      <Section heading="what the tool reads on your machine">
        <p>
          Your AI tools write session logs to disk already. tokn reads those
          files and nothing else. Today it reads Claude Code, Claude Desktop,
          Codex CLI, GitHub Copilot CLI and opencode.
        </p>
        <p>
          Those logs contain your prompts and the model&apos;s replies. tokn
          opens them to pull out token counts and model names, then throws the
          rest away in memory. It never copies the conversation anywhere, and it
          only reads: the files are not modified.
        </p>
        <p>
          Some tools keep usage on their own servers rather than on disk. Cursor
          is one. We cannot read that, and{" "}
          <span className="kbd">tokn sources</span> tells you so rather than
          quietly counting it as zero.
        </p>
      </Section>

      <Section heading="what gets uploaded">
        <p>Every row looks like this, and there is no other kind of row:</p>
        <pre
          style={{
            margin: "0.25rem 0",
            padding: "1rem 1.25rem",
            borderRadius: "var(--radius)",
            background: "var(--sub-alt)",
            fontSize: "0.75rem",
            lineHeight: 1.7,
            color: "var(--sub)",
            overflowX: "auto",
          }}
        >
          {PAYLOAD}
        </pre>
        <p>
          Alongside it we get your timezone name, so days line up, and the CLI
          version. The aggregation happens on your machine before anything is
          sent, so there is nothing finer-grained for us to leak even if we
          wanted it.
        </p>
        <p>
          Run <span className="kbd">tokn sync --dry-run</span> to print the exact
          payload without sending it, or{" "}
          <span className="kbd">tokn scan</span> to see your numbers without an
          account at all.
        </p>
      </Section>

      <Section heading="your account">
        <p>
          A password account stores your handle and a scrypt hash of your
          password. We never see the password itself. No email address is
          required, and we do not ask for your real name.
        </p>
        <p>
          Signing in with GitHub stores your GitHub numeric id, your login name,
          and whatever is on your public profile: display name, bio, avatar and
          website. The app asks GitHub for read access to your profile and email
          addresses and can do nothing else. It cannot see your repositories,
          private or public. Disconnect it from your settings whenever you want.
        </p>
        <p>
          Anything you add yourself (display name, bio, links) is optional and
          public.
        </p>
      </Section>

      <Section heading="linked machines">
        <p>
          When you link a machine we store a hash of its token, plus the
          hostname, the operating system name and the CLI version, so you can
          tell your laptop from your desktop on the account page. The token
          itself is stored only as a SHA-256 digest, so somebody who stole the
          database still could not sync as you.
        </p>
      </Section>

      <Section heading="what is public">
        <p>
          Your handle, display name, bio, links, avatar, daily totals, the
          models and tools you use, your rank and your join date all appear on
          the leaderboard and on your profile page. Anyone can see them without
          signing in.
        </p>
        <p>
          Your password hash, device tokens, hostnames and session cookies are
          not public and are never shown to other users.
        </p>
      </Section>

      <Section heading="cookies">
        <p>
          One cookie, called <span className="kbd">tokn_session</span>. It holds
          a random session id, nothing else, and it exists so you stay signed
          in. It is http-only and expires after thirty days. There are no
          tracking cookies and no third party scripts, so there is no cookie
          banner to click through.
        </p>
      </Section>

      <Section heading="where it lives">
        <p>
          Data is stored with Appwrite, on servers in the United States. They
          hold it on our behalf and do not use it for anything of their own.
          Signing in with GitHub sends a request to GitHub, which has its own
          privacy policy.
        </p>
      </Section>

      <Section heading="how long we keep it">
        <p>
          Usage rows stay until you delete them. Sessions expire after thirty
          days. Link codes expire after ten minutes.
        </p>
        <p>
          Deleting your account from{" "}
          <Link href="/account/settings" className="main link">
            settings
          </Link>{" "}
          removes your profile, your usage history, your linked machines and
          your sessions. It is immediate and we do not keep a shadow copy.
          Backups roll off within thirty days.
        </p>
      </Section>

      <Section heading="your rights">
        <p>
          You can see everything we hold about you on your own profile and
          account pages, edit it in settings, or delete all of it. If you want a
          copy as a file, or you want something corrected that the settings page
          will not let you change, ask and we will sort it out.
        </p>
        <p>
          Depending on where you live you may have further rights over your
          data. Those apply here too. Exercising any of them costs nothing.
        </p>
      </Section>

      <Section heading="age">
        <p>
          There is no age limit. tokn collects token counts, not personal
          details, and we see no reason to gate a leaderboard behind a birthday
          field we would have no way of checking.
        </p>
      </Section>

      <Section heading="changes and contact">
        <p>
          If this policy changes, the date at the top changes with it. Material
          changes get a notice on the site.
        </p>
        <p>
          Reach us through the{" "}
          <a
            href="https://github.com/toknlabs"
            className="main link"
            rel="noreferrer"
            target="_blank"
          >
            toknlabs GitHub
          </a>
          . The{" "}
          <Link href="/terms" className="main link">
            terms of use
          </Link>{" "}
          cover the rest.
        </p>
      </Section>
    </LegalPage>
  );
}

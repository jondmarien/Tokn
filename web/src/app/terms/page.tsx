import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/LegalPage";
import { ISSUES_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Terms — tokn" };

export default function TermsPage() {
  return (
    <LegalPage
      title="terms of use"
      summary="The rules for using tokn, written to be read rather than skipped."
      updated="18 September 2026"
    >
      <Section heading="what tokn is">
        <p>
          tokn is a leaderboard for AI coding usage. You install a command line
          tool, it reads the session logs your AI tools already write to disk,
          and it uploads daily totals to your profile here. The service is free.
        </p>
        <p>
          Anyone can use it. There is no minimum age, no waiting list and no
          requirement to give us an email address.
        </p>
      </Section>

      <Section heading="your account">
        <p>
          You pick a handle and a password, or you sign in with GitHub. Your
          handle is public and it is how you appear on the board. Keep your
          password to yourself. If you think someone else has it, change it and
          revoke your linked machines from your{" "}
          <Link href="/account" className="main link">
            account page
          </Link>
          .
        </p>
        <p>
          One person, one account. Running several accounts to fill the top of
          the board is the one thing we will remove you for.
        </p>
      </Section>

      <Section heading="what you publish">
        <p>
          Syncing puts your daily totals on a public page. That is the point of
          the site, so treat everything you sync as public: your handle, your
          display name, your bio, your links, the models you use and what they
          cost. If you would rather not have that visible, do not sync.
        </p>
        <p>
          You keep ownership of your usage data. By syncing it you let us store
          it and show it on the leaderboard. That permission ends when you
          delete the data.
        </p>
      </Section>

      <Section heading="the numbers are estimates">
        <p>
          Costs are calculated, not billed. tokn reads token counts from your
          local logs and multiplies them by published API rates. Your real
          invoice will differ, sometimes by a lot: subscription plans, free
          tiers, credits, committed-use discounts and enterprise pricing are all
          invisible to us. Context-tiered pricing is not applied either.
        </p>
        <p>
          Use the figures to compare your own weeks against each other, or to
          see roughly where you sit. Do not use them for accounting, expense
          reports or deciding what to charge a client.
        </p>
      </Section>

      <Section heading="fair use">
        <p>Do not:</p>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.1rem",
            display: "grid",
            gap: "0.4rem",
          }}
        >
          <li>send made up numbers, or edit your logs to inflate them</li>
          <li>sync usage that is not yours</li>
          <li>run multiple accounts for one person</li>
          <li>
            hammer the API, or try to read other people&apos;s private data
          </li>
          <li>
            put anything in your handle, name, bio or links that is illegal,
            abusive, or impersonates somebody else
          </li>
        </ul>
        <p>
          We can remove a profile that does any of this. If it looks like a
          mistake rather than an attempt to game the board, we will say so
          before doing anything.
        </p>
      </Section>

      <Section heading="what we promise, and what we do not">
        <p>
          tokn is provided as it is. We do not guarantee the site stays up, that
          the numbers are accurate, or that your data cannot be lost. It is a
          leaderboard, not a system of record. Keep your own logs if they matter
          to you: everything here is derived from files that stay on your
          machine.
        </p>
        <p>
          To the extent the law allows, we are not liable for losses arising
          from using the site. Nothing here limits rights you have that cannot
          be waived where you live.
        </p>
      </Section>

      <Section heading="the command line tool">
        <p>
          The CLI is open source under the GNU General Public License v3. You
          can read it, change it and run your own copy. It only ever reads log
          files; it does not modify them, and it does not read your code.
        </p>
      </Section>

      <Section heading="ending it">
        <p>
          Delete your account from your{" "}
          <Link href="/account/settings" className="main link">
            settings
          </Link>{" "}
          whenever you like. Your profile and every usage row go with it, and
          you come off the board straight away. Run{" "}
          <span className="kbd">tokn unlink</span> to disconnect a machine
          without deleting anything.
        </p>
        <p>
          We can close an account that breaks the fair use rules above. Short of
          that we will not delete your data without telling you.
        </p>
      </Section>

      <Section heading="changes">
        <p>
          If these terms change in a way that affects you, the date at the top
          changes and we will post a notice on the site. Carrying on using tokn
          after that means the new version applies. We will not quietly rewrite
          this page and pretend it always said that.
        </p>
      </Section>

      <Section heading="getting in touch">
        <p>
          Questions, complaints and data requests go to the same place: open an
          issue on the{" "}
          <a
            href={ISSUES_URL}
            className="main link"
            rel="noreferrer"
            target="_blank"
          >
            toknlabs GitHub
          </a>
          . See also the{" "}
          <Link href="/privacy" className="main link">
            privacy policy
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}

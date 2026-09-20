import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LinkPanel } from "@/components/LinkPanel";
import { Terminal } from "@/components/Terminal";
import { currentUser, issueLinkCode } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connect a machine — tokn" };

export default async function LinkPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/link");

  // A fresh code per visit; issuing one retires any the user still had open.
  const { code, expiresAt } = await issueLinkCode(user.id);

  return (
    <>
      <section>
        <h1 className="title">connect a machine</h1>
        <p className="lede" style={{ marginTop: "0.6rem" }}>
          install the cli, run it, paste the code. it scans locally and uploads daily totals per
          model — nothing else leaves the machine.
        </p>
      </section>

      <div
        style={{
          display: "grid",
          gap: "2.5rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))",
          alignItems: "start",
        }}
      >
        <section>
          <p className="block-label" style={{ marginBottom: "1rem" }}>
            three commands
          </p>
          <Terminal commands={["npm install -g tokn", "tokn link", "tokn sync"]} />

          <ol
            className="micro"
            style={{ paddingLeft: "1.1rem", marginTop: "1.25rem", display: "grid", gap: "0.45rem" }}
          >
            <li>install puts the binary on your path</li>
            <li>
              <span className="kbd">tokn link</span> prompts for the code
            </li>
            <li>
              <span className="kbd">tokn sync</span> scans your sessions and publishes the totals
            </li>
          </ol>

          <p className="micro" style={{ marginTop: "1.5rem" }}>
            <span className="kbd">tokn scan</span> prints the same numbers without uploading
            anything — full detail in{" "}
            <Link href="/about" className="main link">
              about
            </Link>
          </p>
        </section>

        <LinkPanel initialCode={code} initialExpiry={expiresAt} />
      </div>
    </>
  );
}

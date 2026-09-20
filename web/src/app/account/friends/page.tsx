import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FriendsPanel } from "@/components/FriendsPanel";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Friends — tokn" };

export default async function FriendsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account/friends");

  return (
    <>
      <section>
        <h1 className="title">friends</h1>
        <p className="lede" style={{ marginTop: "0.75rem" }}>
          A board of people you actually know. Add someone by handle; they have to
          accept before either of you appears on the other&apos;s board.
        </p>
      </section>

      <FriendsPanel />
    </>
  );
}

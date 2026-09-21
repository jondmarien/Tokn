import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Onboarding } from "@/components/Onboarding";
import { currentUser, issueLinkCode } from "@/lib/auth";
import { listDevices, listPasskeys } from "@/lib/backend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Welcome — tokn" };

/**
 * Shown once, right after signing up.
 *
 * The link code is issued here rather than fetched by the client so the first
 * paint already has one. The reader is being asked to switch to a terminal,
 * and a spinner where the code should be is exactly the wrong thing to hand
 * them at that moment.
 */
export default async function WelcomePage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/welcome");

  const [{ code, expiresAt }, devices, passkeys] = await Promise.all([
    issueLinkCode(user.id),
    listDevices(user.id),
    listPasskeys(user.id),
  ]);

  return (
    <Onboarding
      handle={user.handle}
      initialCode={code}
      initialExpiry={expiresAt}
      alreadyLinked={devices.length > 0}
      hasPasskey={passkeys.length > 0}
    />
  );
}

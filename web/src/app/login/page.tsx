import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { githubEnabled } from "@/lib/backend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "sign in — tokn" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/account");

  const { next, error } = await searchParams;
  // Only same-site paths, so `?next=` cannot be used as an open redirect.
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";

  return (
    <AuthForm
      next={destination}
      github={githubEnabled()}
      initialError={error ? error.slice(0, 200) : null}
    />
  );
}

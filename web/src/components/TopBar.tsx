"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu, type AccountMenuUser } from "./AccountMenu";
import { Mark } from "./Mark";

/**
 * Wordmark, the shared destinations, and the account.
 *
 * The nav is for the parts of the site everyone sees, and only those: the
 * board and the site-wide numbers. Anything that belongs to one person — their
 * stats, their friends, their machines, their settings — lives behind their
 * own name in the account menu. Linking a machine is an account action, not a
 * destination, so `connect` sits there too.
 *
 * `about` is in the footer, where a page you read once belongs.
 */

const LINKS = [
  { href: "/", label: "leaderboard", exact: true },
  { href: "/stats", label: "stats" },
];

export function TopBar({ user }: { user: AccountMenuUser | null }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <header className="topbar">
      <div className="shell">
        <div className="topbar-inner">
          <Link href="/" className="wordmark" aria-label="tokn, home">
            <Mark />
            tokn
          </Link>

          <nav className="navlinks">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="navlink"
                data-active={isActive(link.href, link.exact)}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="topbar-right">
            {user ? (
              <AccountMenu user={user} />
            ) : (
              <Link href="/login" className="navlink">
                sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

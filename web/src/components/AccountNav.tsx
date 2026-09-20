"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tabs across the account section. The public profile is the way out of it. */
export function AccountNav({ handle }: { handle: string }) {
  const pathname = usePathname();

  const TABS = [
    { href: "/account", label: "stats", exact: true },
    { href: "/account/friends", label: "friends" },
    { href: "/account/settings", label: "settings" },
  ];

  return (
    <nav className="subnav">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="subnav-tab"
          data-active={tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)}
        >
          {tab.label}
        </Link>
      ))}

      <Link href={`/profile/${handle}`} className="subnav-tab out">
        public profile ↗
      </Link>
    </nav>
  );
}

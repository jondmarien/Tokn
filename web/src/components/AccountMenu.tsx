"use client";

import Link from "next/link";
import {
  ChartGlyph,
  CogGlyph,
  ExitGlyph,
  FriendsGlyph,
  GlobeGlyph,
  PersonGlyph,
  PlugGlyph,
} from "./Glyphs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The account menu in the top bar.
 *
 * Everything that belongs to *you* lives behind your own name rather than
 * competing for a slot in the nav, which is why Friends moved in here. The nav
 * is for the parts of the site everyone shares.
 */

export interface AccountMenuUser {
  handle: string;
}

/**
 * How long the menu stays open after the pointer leaves.
 *
 * Without a grace period the menu closes in the gap between the trigger and
 * the panel, and on the diagonal path people actually take toward an item
 * further down. Long enough to forgive that, short enough not to linger.
 */
const CLOSE_DELAY_MS = 220;

export function AccountMenu({ user }: { user: AccountMenuUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  // A stray timer must not fire into an unmounted component.
  useEffect(() => cancelClose, [cancelClose]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // `pointerdown` rather than `click`: closing on the press means the menu is
    // gone before whatever was underneath receives its own click.
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setOpen(false);
      router.push("/");
      // The layout reads the session cookie server-side, so the whole tree has
      // to re-render or the bar keeps showing the old name.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    // Hover opens it, and the whole wrapper — trigger and panel — is the hover
    // target, so moving down into the menu never crosses a dead gap. Click and
    // keyboard still work, for touch and for anyone not using a pointer.
    <div
      className="menu-wrap"
      ref={wrapRef}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        scheduleClose();
      }}
      onFocus={() => {
        cancelClose();
        setOpen(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        type="button"
        className="navlink menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <PersonGlyph />
        {user.handle}
      </button>

      {open && (
        <div className="menu" role="menu">
          <MenuLink
            href="/account"
            onPick={() => setOpen(false)}
            icon={<ChartGlyph />}
          >
            user stats
          </MenuLink>
          <MenuLink
            href="/account/friends"
            onPick={() => setOpen(false)}
            icon={<FriendsGlyph />}
          >
            friends
          </MenuLink>
          <MenuLink
            href={`/profile/${user.handle}`}
            onPick={() => setOpen(false)}
            icon={<GlobeGlyph />}
          >
            public profile
          </MenuLink>
          <MenuLink
            href="/link"
            onPick={() => setOpen(false)}
            icon={<PlugGlyph />}
          >
            connect a machine
          </MenuLink>
          <MenuLink
            href="/account/settings"
            onPick={() => setOpen(false)}
            icon={<CogGlyph />}
          >
            account settings
          </MenuLink>

          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
          >
            <ExitGlyph />
            {busy ? "signing out…" : "sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  onPick,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="menu-item" role="menuitem" onClick={onPick}>
      {icon}
      {children}
    </Link>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import {
  ChartGlyph,
  CogGlyph,
  DocGlyph,
  InfoGlyph,
  LockGlyph,
  PlugGlyph,
} from "@/components/Glyphs";
import { SocialIcon } from "@/components/SocialIcon";
import { TopBar } from "@/components/TopBar";
import { ThemePicker } from "@/components/ThemePicker";
import { VersionChip } from "@/components/VersionChip";
import { themeBootScript } from "@/components/theme";
import { themeStylesheet } from "@/lib/themes";
import { SOURCE_URL, X_HANDLE, X_URL } from "@/lib/site";
import "./globals.css";

/**
 * Geist Mono is the interface face. A table of numbers holds its shape with
 * nothing drawn around it when every glyph is the same width, which is what
 * lets the tables here have no rules and no borders at all.
 */
const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const TITLE = "tokn — AI usage leaderboard";
const DESCRIPTION =
  "Measured AI coding spend from real sessions. Scanned locally by the tokn CLI, ranked here.";

export const metadata: Metadata = {
  // Card images have to be absolute URLs. Without a base, Next emits the
  // localhost origin it happens to be running on, which is what a scraper
  // would then try to fetch. Driven by env so deploying is a config change.
  metadataBase: new URL(process.env.TOKN_PUBLIC_URL ?? "http://localhost:3000"),
  title: TITLE,
  description: DESCRIPTION,
  // `opengraph-image.png` and `twitter-image.png` sit beside this file, so Next
  // fills in the image tags itself. These blocks are here for the title and
  // description, which it does not infer.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "tokn",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    // Attributes the card to the project's account, so a shared link shows
    // "from @trytokn" rather than a bare domain.
    site: X_HANDLE,
    creator: X_HANDLE,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Every theme's palette, generated from the catalogue. Selectors are
          `html[data-theme="…"]` so they outrank the default block in
          globals.css whatever order the sheets land in.
        */}
        <style dangerouslySetInnerHTML={{ __html: themeStylesheet() }} />
        {/* Applies the stored theme before first paint so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <div className="page">
          <TopBar user={user ? { handle: user.handle } : null} />

          <div className="shell shell-fill">
            <main>{children}</main>

            <footer className="footer">
              <nav className="footer-links" aria-label="site">
                <Link href="/stats">
                  <ChartGlyph size={13} />
                  stats
                </Link>
                <Link href="/about">
                  <InfoGlyph size={13} />
                  about
                </Link>
                <Link href="/link">
                  <PlugGlyph size={13} />
                  connect
                </Link>
                <Link href="/account/settings">
                  <CogGlyph size={13} />
                  settings
                </Link>
                <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                  <SocialIcon provider="github" size={13} />
                  github
                </a>
                <a href={X_URL} target="_blank" rel="noreferrer">
                  <SocialIcon provider="x" size={12} />x
                </a>
                <Link href="/terms">
                  <DocGlyph size={13} />
                  terms
                </Link>
                <Link href="/privacy">
                  <LockGlyph size={13} />
                  privacy
                </Link>
              </nav>

              {/* Controls rather than destinations, so they sit under the row
                  instead of competing with it. */}
              <div className="footer-chips">
                <ThemePicker />
                <VersionChip />
              </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}

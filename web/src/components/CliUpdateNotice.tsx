"use client";

import { useEffect, useState } from "react";
import type { OutdatedDevice } from "@/lib/cli-version";

/**
 * Tells someone a linked machine is running an old CLI.
 *
 * From 0.1.3 the CLI offers its own update, so for those copies this is a
 * second reminder and nothing more. It exists for the ones before that, which
 * have no way to tell their owner anything: without this a machine can sit on
 * a stale build forever while the person who owns it has no reason to look.
 *
 * Dismissal is per version and kept in this browser. Dismissing it means "I
 * have read this", not "never mention updates again": a later release says so
 * again, which is the point. Storage is wrapped because a browser with site
 * data blocked throws on access rather than returning null, and a notice is
 * not worth breaking a page over.
 */
export function CliUpdateNotice({
  devices,
  latest,
}: {
  devices: OutdatedDevice[];
  latest: string;
}) {
  const key = `tokn.cli-notice.${latest}`;
  // Hidden until the effect has read storage, so a dismissed notice never
  // flashes on screen before disappearing.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) !== "1") setShow(true);
    } catch {
      setShow(true);
    }
  }, [key]);

  if (devices.length === 0 || !show) return null;

  const silent = devices.filter((device) => device.silent);
  const oldest = devices.reduce((worst, device) =>
    device.version < worst.version ? device : worst,
  );

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Dismissed for this view only. Better than an unhandled exception.
    }
  };

  return (
    <div className="cli-notice" role="status">
      <div className="cli-notice-body">
        <p className="cli-notice-title">
          {devices.length === 1
            ? `${oldest.hostname} is running tokn ${oldest.version}`
            : `${devices.length} machines are running an old tokn`}
          <span className="cli-notice-latest"> · {latest} is out</span>
        </p>

        <p className="micro">
          {silent.length > 0
            ? "that version cannot update itself, so it has to be done by hand:"
            : "run this, or let the cli offer next time you use it:"}
        </p>

        <code className="cli-notice-cmd">npm install -g toknhq@latest</code>
      </div>

      <button type="button" className="btn bare" onClick={dismiss} aria-label="dismiss">
        ×
      </button>
    </div>
  );
}

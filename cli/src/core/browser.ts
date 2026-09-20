import { spawn } from "node:child_process";

/**
 * Best-effort browser launch.
 *
 * Never fatal and never awaited: every caller prints the URL first, so a
 * headless machine, a missing handler or a locked-down environment costs the
 * user a copy-paste rather than an error. The child is detached and unref'd so
 * it cannot keep the CLI alive after the command is done.
 */
export function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

  try {
    const child = spawn(command, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Headless machine or no handler registered; the printed URL still works.
  }
}

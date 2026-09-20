#!/usr/bin/env node

/**
 * Printed once, after `npm install -g tokn`.
 *
 * This says "run tokn" rather than running it. An install script that drops
 * someone into an interactive wizard breaks every non-interactive install
 * there is — `npm ci`, Docker builds, CI, a Dockerfile layer, anything piping
 * output to a file — and there is no way to tell those apart reliably enough
 * to risk it. npm hands install scripts a stdout that often is not a terminal
 * and no stdin worth reading, so prompting there hangs the install instead of
 * helping.
 *
 * So: print a pointer, and let the wizard run when a person types the command.
 * Bare `tokn` detects a machine with no stored credential and goes straight to
 * setup, which gets the same result one keystroke later and never wedges a
 * build.
 *
 * Nothing here may fail the install. Every path exits 0.
 */

const quiet =
  // A non-interactive install: a build, a CI job, output being captured.
  !process.stdout.isTTY ||
  process.env.CI ||
  process.env.TOKN_NO_POSTINSTALL ||
  // npm sets this for dependency installs; a notice is only for the person who
  // asked for this package by name.
  process.env.npm_config_global !== "true";

if (quiet) process.exit(0);

const color = !process.env.NO_COLOR && process.env.TERM !== "dumb";
const bold = (s) => (color ? `\u001b[1m${s}\u001b[22m` : s);
const dim = (s) => (color ? `\u001b[2m${s}\u001b[22m` : s);
const cyan = (s) => (color ? `\u001b[36m${s}\u001b[39m` : s);

process.stdout.write(
  [
    "",
    `  ${bold("tokn")} ${dim("is installed.")}`,
    "",
    `  Run ${cyan("tokn")} to set it up. It takes two steps:`,
    `    ${dim("1.")} link this machine to your account`,
    `    ${dim("2.")} choose whether it uploads in the background`,
    "",
    `  ${dim("Nothing is sent anywhere until you say so.")}`,
    "",
    "",
  ].join("\n"),
);

import fs from "node:fs";

/**
 * Repair the OSC 8 hyperlink helper.
 *
 * An OSC string runs until a terminator. Without the BEL bytes the terminal
 * keeps consuming output as part of the URL parameter, so the newline after
 * the link and the entire following line vanish. The terminators were lost
 * with the rest of this file's control bytes.
 */

const file = "src/ui/prompt.ts";
const ESC = "\\u001b";
const BEL = "\\u0007";

const body = [
  "/**",
  " * Render a URL so terminals that support OSC 8 make it clickable.",
  " *",
  " * The BEL terminators are load-bearing. An OSC string runs until a",
  " * terminator, so without them the terminal swallows whatever follows as part",
  " * of the URL parameter: the newline after the link and the whole next line",
  " * disappeared. Written as escapes so a stripped control byte cannot bring the",
  " * bug back.",
  " */",
  "export function link(url: string): string {",
  "  if (!process.stdout.isTTY) return url;",
  "  const open = `" + ESC + "]8;;${url}" + BEL + "`;",
  "  const close = `" + ESC + "]8;;" + BEL + "`;",
  "  return `${open}${cyan(url)}${close}`;",
  "}",
].join("\n");

let source = fs.readFileSync(file, "utf8");
const start = source.indexOf("/** Render a URL so terminals");
if (start === -1) throw new Error("link() helper not found");

const end = source.indexOf("\n}", source.indexOf("export function link(", start)) + 2;
source = source.slice(0, start) + body + source.slice(end);

fs.writeFileSync(file, source);
console.log("  prompt.ts: OSC 8 terminators restored");

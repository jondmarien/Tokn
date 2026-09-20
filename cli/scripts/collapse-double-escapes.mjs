import fs from "node:fs";
import path from "node:path";

/**
 * Collapse doubled backslashes in unicode escapes.
 *
 * A source line holding `\\u001b` emits the six characters `` rather
 * than the escape character. It is the mirror of the stripped-ESC problem and
 * just as invisible: it compiles, runs, and prints garbage.
 *
 *   node scripts/collapse-double-escapes.mjs
 */

const BACKSLASH = String.fromCharCode(92);
const DOUBLE = new RegExp(`${BACKSLASH}${BACKSLASH}${BACKSLASH}${BACKSLASH}(u[0-9a-fA-F]{4})`, "g");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

let total = 0;
for (const file of walk("src")) {
  const before = fs.readFileSync(file, "utf8");
  const matches = before.match(DOUBLE);
  if (!matches) continue;

  fs.writeFileSync(file, before.replace(DOUBLE, `${BACKSLASH}$1`));
  total += matches.length;
  console.log(`  ${file}: collapsed ${matches.length}`);
}

console.log(total === 0 ? "  no doubled escapes" : `  ${total} fixed`);

import fs from "node:fs";
import path from "node:path";

/**
 * Find ANSI control sequences that have lost their ESC byte.
 *
 * A raw ESC in a source file does not survive every editor, transport or
 * copy-paste. When it is stripped, `ESC[2K` becomes the literal text `[2K`,
 * which compiles and runs but prints as garbage instead of clearing the line.
 * Nothing in a type-check or a test catches it.
 *
 * The fix is always the same: write `` in the source. This script finds
 * the ones that need it and, with --fix, repairs them.
 *
 *   node scripts/check-escapes.mjs [--fix]
 */

const ESC = String.fromCharCode(27);
const FIX = process.argv.includes("--fix");

/**
 * A control sequence inside a string literal that is not preceded by an
 * escape. CSI (`[` + params + letter) and the OSC 8 hyperlink introducer are
 * the two shapes this codebase uses.
 */
const SUSPECT = /(?<!\\u001b|\\x1b|\\033|)(\[[0-9;?]*[A-Za-z]|\]8;;)/g;

function scan(file) {
  const source = fs.readFileSync(file, "utf8");
  const hits = [];
  let fixed = source;

  source.split("\n").forEach((line, i) => {
    // Only look inside string and template literals.
    const literals = line.match(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g) ?? [];
    for (const literal of literals) {
      for (const match of literal.matchAll(SUSPECT)) {
        // A bare `[0]` index or a markdown link is not a control sequence;
        // require a plausible CSI final byte or the OSC introducer.
        const seq = match[1];
        if (seq.startsWith("]8;;") || /^\[[0-9;?]*[A-Za-z]$/.test(seq)) {
          hits.push({ line: i + 1, seq, text: line.trim().slice(0, 80) });
        }
      }
    }
  });

  if (FIX && hits.length > 0) {
    fixed = source.replace(
      /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g,
      (whole, quote, body) => {
        const repaired = body.replace(SUSPECT, (m) => `\\u001b${m}`);
        return `${quote}${repaired}${quote}`;
      },
    );
    fs.writeFileSync(file, fixed);
  }

  return hits;
}

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
  const hits = scan(file);
  if (hits.length === 0) continue;
  total += hits.length;
  console.log(`\n  ${file}`);
  for (const hit of hits) {
    console.log(`    line ${String(hit.line).padStart(3)}  ${JSON.stringify(hit.seq)}`);
  }
}

// A literal control byte is the other half of the same problem: it works
// today and is what gets stripped tomorrow. ESC is the common one, but a raw
// 0x03 for Ctrl-C fails the same way, and more quietly: the comparison just
// stops matching.
let literals = 0;
for (const file of walk("src")) {
  const source = fs.readFileSync(file, "utf8");
  for (const [code, name] of [[27, "ESC"], [3, "ETX"], [7, "BEL"], [8, "BS"]]) {
    const count = source.split(String.fromCharCode(code)).length - 1;
    if (count === 0) continue;
    literals += count;
    const hex = code.toString(16).padStart(4, "0");
    console.log(`\n  ${file}: ${count} literal ${name} byte(s) — replace with \\u${hex}`);
  }
}

console.log();
if (total === 0 && literals === 0) {
  console.log("  All escape sequences are written as \\u001b. Nothing to fix.");
} else if (FIX) {
  console.log(`  Repaired ${total} sequence(s). Re-run without --fix to confirm.`);
} else {
  console.log(`  ${total} sequence(s) missing an escape. Run with --fix.`);
  process.exitCode = 1;
}

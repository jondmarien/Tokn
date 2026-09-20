import fs from "node:fs";

/**
 * Replace literal ESC bytes in source with `` escape sequences.
 *
 * A raw control character in a source file does not survive every editor,
 * transport or copy-paste. When it is lost the escape sequence prints as
 * visible text — which is exactly what happened to the logo. The escape
 * sequence compiles to the same byte and cannot be damaged the same way.
 *
 *   node scripts/fix-escapes.mjs src/ui/logo.ts src/ui/heatmap.ts
 */

const ESC = String.fromCharCode(27);
let touched = 0;

for (const file of process.argv.slice(2)) {
  const before = fs.readFileSync(file, "utf8");
  if (!before.includes(ESC)) {
    console.log(`  ${file}: no literal ESC`);
    continue;
  }
  const after = before.split(ESC).join("\\u001b");
  fs.writeFileSync(file, after);
  const count = before.split(ESC).length - 1;
  console.log(`  ${file}: replaced ${count} literal ESC byte(s)`);
  touched++;
}

console.log(touched === 0 ? "  nothing to do" : `  ${touched} file(s) hardened`);

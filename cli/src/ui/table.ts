import { dim, padEnd, padStart, sym, visibleWidth } from "./ansi.js";

export interface Column {
  header: string;
  /** Numeric columns read better right-aligned under a right-aligned header. */
  align?: "left" | "right";
}

export interface TableOptions {
  indent?: string;
  /** Draw a rule above the final row — used to set a TOTAL row apart. */
  ruleBeforeLast?: boolean;
}

/**
 * Renders a fixed-width table. Column widths come from the widest visible cell,
 * measured with ANSI escapes excluded so that coloured cells still line up.
 */
export function renderTable(
  columns: Column[],
  rows: string[][],
  options: TableOptions = {},
): string {
  const indent = options.indent ?? "  ";
  const widths = columns.map((col, i) => {
    let w = visibleWidth(col.header);
    for (const row of rows) w = Math.max(w, visibleWidth(row[i] ?? ""));
    return w;
  });

  const align = (text: string, i: number): string => {
    const w = widths[i] ?? 0;
    return columns[i]?.align === "right" ? padStart(text, w) : padEnd(text, w);
  };

  const lines: string[] = [];

  lines.push(
    indent + dim(columns.map((c, i) => align(c.header.toUpperCase(), i)).join("  ").trimEnd()),
  );

  const totalWidth = widths.reduce((a, b) => a + b, 0) + (columns.length - 1) * 2;

  rows.forEach((row, rowIndex) => {
    if (options.ruleBeforeLast && rowIndex === rows.length - 1 && rows.length > 1) {
      lines.push(indent + dim(sym.line.repeat(totalWidth)));
    }
    lines.push(indent + row.map((cell, i) => align(cell ?? "", i)).join("  ").trimEnd());
  });

  return lines.join("\n");
}

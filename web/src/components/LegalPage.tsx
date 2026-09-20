import type { ReactNode } from "react";

/**
 * Shared frame for the terms and privacy pages.
 *
 * Narrow measure and generous line height: these are the two pages people
 * actually have to read, so they should not be a wall.
 */
export function LegalPage({
  title,
  summary,
  updated,
  children,
}: {
  title: string;
  summary: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div style={{ maxWidth: "42rem", margin: "0 auto", width: "100%" }}>
      <h1 className="title">{title}</h1>
      <p className="lede" style={{ marginTop: "0.75rem" }}>
        {summary}
      </p>
      <p className="micro" style={{ marginTop: "0.75rem" }}>
        Last updated {updated}.
      </p>

      <div className="legal" style={{ marginTop: "2.5rem" }}>
        {children}
      </div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: "2.25rem" }}>
      <h2
        className="block-label"
        style={{ marginBottom: "0.75rem", fontSize: "0.8125rem" }}
      >
        {heading}
      </h2>
      <div style={{ display: "grid", gap: "0.85rem" }}>{children}</div>
    </section>
  );
}

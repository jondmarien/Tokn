import { SkeletonLine, SkeletonTable } from "@/components/Skeleton";

/** The board. Header strip, totals, then rows. */
export default function Loading() {
  return (
    <>
      <section>
        <SkeletonLine width="9rem" height="1.8rem" />
      </section>
      <section
        style={{
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(7rem, 1fr))",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "grid", gap: "0.5rem" }}>
            <SkeletonLine width="4.5rem" height="0.7rem" />
            <SkeletonLine width="6.5rem" height="1.6rem" />
          </div>
        ))}
      </section>
      <SkeletonTable rows={10} />
    </>
  );
}

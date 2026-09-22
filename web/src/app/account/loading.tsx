import { SkeletonBlock, SkeletonLine, SkeletonStats } from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <section className="row" style={{ gap: "0.9rem", alignItems: "center" }}>
        <span className="skeleton" style={{ width: 44, height: 44, borderRadius: "50%" }} />
        <SkeletonLine width="10rem" height="1.3rem" />
      </section>
      <SkeletonStats />
      <SkeletonBlock rows={5} />
    </>
  );
}

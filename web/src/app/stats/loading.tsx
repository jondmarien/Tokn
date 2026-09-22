import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";

/** The slowest page on the site, and so the one that needed this most. */
export default function Loading() {
  return (
    <>
      <section>
        <SkeletonLine width="7rem" height="1.8rem" />
      </section>
      <SkeletonBlock rows={4} />
      <SkeletonBlock rows={6} />
      <SkeletonBlock rows={4} />
    </>
  );
}

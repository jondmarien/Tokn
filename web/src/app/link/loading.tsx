import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <section>
        <SkeletonLine width="12rem" height="1.8rem" />
      </section>
      <SkeletonBlock rows={3} />
    </>
  );
}

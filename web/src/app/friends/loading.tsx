import { SkeletonLine, SkeletonTable } from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <section>
        <SkeletonLine width="6rem" height="1.8rem" />
      </section>
      <SkeletonTable rows={6} />
    </>
  );
}

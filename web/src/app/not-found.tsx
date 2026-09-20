import Link from "next/link";

export default function NotFound() {
  return (
    <section style={{ paddingBlock: "5rem", textAlign: "center" }}>
      <p className="display">404</p>
      <p className="sub" style={{ marginTop: "1rem" }}>
        no such page —{" "}
        <Link href="/" className="main link">
          back to the leaderboard
        </Link>
      </p>
    </section>
  );
}

import { niceDay } from "@/lib/format";

/**
 * Hand-rolled SVG charts.
 *
 * No charting library: these render on the server, read the theme through CSS
 * variables, and ship no JavaScript. Tooltips are native `<title>` elements,
 * which work with scripting disabled.
 *
 * The house style is deliberately bare — no gridlines, no axis ticks, one
 * stroke and one soft fill. The shape of the data is the whole point; the
 * numbers live in the label above the chart.
 */

export interface SeriesPoint {
  day: string;
  value: number;
}

/* ------------------------------------------------------------ area chart */

/**
 * A filled trend line with no chrome. Start and end dates sit below it.
 *
 * The fill is a gradient that dies out before the baseline. A flat wash of the
 * accent across a wide chart turns into a coloured block that competes with the
 * line; fading it keeps the stroke as the thing you read.
 */
export function AreaChart({
  points,
  format,
  height = 170,
}: {
  points: SeriesPoint[];
  format: (value: number) => string;
  height?: number;
}) {
  if (points.length < 2) return <p className="empty">not enough data yet</p>;

  const W = 1000;
  const pad = 6;
  const max = Math.max(...points.map((point) => point.value)) || 1;
  const fillId = `fade-${points.length}-${Math.round(max)}`;

  const xOf = (index: number) => (index / (points.length - 1)) * W;
  const yOf = (value: number) =>
    height - pad - (value / max) * (height - pad * 2);

  const line = points
    .map((point, index) => `${xOf(index)},${yOf(point.value)}`)
    .join(" ");
  const band = W / points.length;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      style={{ display: "block", width: "100%", height: "auto" }}
      role="img"
      aria-label="daily trend"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--main)" stopOpacity={0.18} />
          <stop offset="100%" stopColor="var(--main)" stopOpacity={0} />
        </linearGradient>
      </defs>

      <polygon
        points={`0,${height} ${line} ${W},${height}`}
        fill={`url(#${fillId})`}
      />
      <polyline
        points={line}
        fill="none"
        stroke="var(--main)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeOpacity={0.9}
        vectorEffect="non-scaling-stroke"
      />

      {points.map((point, index) => (
        /* A wide invisible band gives the tooltip something to hit. */
        <rect
          key={point.day}
          x={xOf(index) - band / 2}
          y={0}
          width={Math.max(band, 2)}
          height={height}
          fill="transparent"
        >
          <title>{`${niceDay(point.day)} · ${format(point.value)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------ share bars */

/** Proportional split as labelled hairline bars. */
export function ShareBars({
  rows,
}: {
  rows: { label: string; value: number; display: string }[];
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) return <p className="empty">no data yet</p>;

  return (
    <div style={{ display: "grid", gap: "0.85rem" }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              marginBottom: "0.4rem",
            }}
          >
            <span className="sub" style={{ fontSize: "0.8125rem" }}>
              {row.label}
            </span>
            <span style={{ fontSize: "0.8125rem" }}>{row.display}</span>
          </div>
          <div className="bar">
            <span
              style={{ width: `${Math.max((row.value / total) * 100, 0.8)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

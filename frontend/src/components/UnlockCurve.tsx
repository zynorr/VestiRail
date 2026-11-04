import { useMemo, useState } from "react";
import { vestedAmount } from "../../../shared/vesting";
import type { ChainEvent, Schedule } from "../lib/types";
import { formatAmount, formatDate, formatPercent } from "../lib/format";

type CurveItem = Pick<
  Schedule,
  "id" | "start" | "cliffDuration" | "duration" | "total" | "claimed"
>;

function compact(value: bigint, decimals: number): string {
  const units: [bigint, string][] = [
    [1_000_000_000n * 10n ** BigInt(decimals), "B"],
    [1_000_000n * 10n ** BigInt(decimals), "M"],
    [1_000n * 10n ** BigInt(decimals), "K"],
  ];
  const negative = value < 0n;
  const abs = negative ? -value : value;
  for (const [threshold, suffix] of units) {
    if (abs >= threshold) {
      const scaled = Number(abs) / Number(threshold);
      const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
      return `${negative ? "-" : ""}${text}${suffix}`;
    }
  }
  return formatAmount(value, decimals, 2);
}

export function UnlockCurve({
  items,
  events,
  tokenAddress,
  from,
  to,
  now,
  height = 240,
  compactMode = false,
  showClaimed = true,
  symbol,
  decimals,
}: {
  items: CurveItem[];
  events: ChainEvent[];
  tokenAddress: string;
  from: bigint;
  to: bigint;
  now: bigint;
  height?: number;
  compactMode?: boolean;
  showClaimed?: boolean;
  symbol: string;
  decimals: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const samples = compactMode ? 64 : 120;
    const span = to - from > 0n ? to - from : 1n;
    const points = Array.from({ length: samples }, (_, index) =>
      from + (span * BigInt(index)) / BigInt(samples - 1),
    );

    const claims = events
      .filter(
        (event) =>
          event.kind === "claimed" &&
          event.token.address.toLowerCase() === tokenAddress.toLowerCase() &&
          event.amount !== undefined &&
          event.timestamp > 0n,
      )
      .sort((a, b) => Number(a.timestamp - b.timestamp));

    const vested: bigint[] = [];
    const claimed: bigint[] = [];

    for (const timestamp of points) {
      let vestedSum = 0n;
      for (const item of items) {
        vestedSum += vestedAmount(
          {
            totalAmount: item.total,
            start: item.start,
            cliffDuration: item.cliffDuration,
            duration: item.duration,
          },
          timestamp,
        );
      }
      vested.push(vestedSum);

      let claimedSum = 0n;
      for (const claim of claims) {
        if (claim.timestamp <= timestamp) claimedSum += claim.amount ?? 0n;
      }
      claimed.push(claimedSum);
    }

    const allocated = items.reduce((sum, item) => sum + item.total, 0n);
    const peak = Math.max(
      Number(allocated),
      ...vested.map((value) => Number(value)),
      ...claimed.map((value) => Number(value)),
      1,
    );

    return { points, vested, claimed, allocated, peak, samples };
  }, [items, events, tokenAddress, from, to, compactMode]);

  const width = 760;
  const padding = { left: compactMode ? 8 : 46, right: 10, top: 12, bottom: compactMode ? 8 : 26 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const span = Number(to - from > 0n ? to - from : 1n);

  const xFor = (timestamp: bigint) =>
    padding.left + (Number(timestamp - from) / span) * plotW;
  const yFor = (value: bigint) =>
    padding.top + (1 - Number(value) / model.peak) * plotH;

  const line = (values: bigint[]) =>
    values
      .map((value, index) => `${index === 0 ? "M" : "L"}${xFor(model.points[index]).toFixed(1)},${yFor(value).toFixed(1)}`)
      .join(" ");

  const vestedPath = line(model.vested);
  const claimedPath = line(model.claimed);
  const baseline = padding.top + plotH;
  const areaPath = `${vestedPath} L${xFor(model.points[model.points.length - 1]).toFixed(1)},${baseline} L${padding.left},${baseline} Z`;

  const activeIndex =
    hover ??
    Math.max(
      0,
      Math.min(
        model.points.length - 1,
        Math.round((Number(now - from) / span) * (model.points.length - 1)),
      ),
    );
  const activeTime = model.points[activeIndex];
  const activeVested = model.vested[activeIndex] ?? 0n;
  const activeClaimed = model.claimed[activeIndex] ?? 0n;
  const activeLocked = model.allocated > activeVested ? model.allocated - activeVested : 0n;

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (model.points.length - 1));
    setHover(Math.max(0, Math.min(model.points.length - 1, index)));
  };

  return (
    <div className="curve">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="curve-svg"
        role="img"
        aria-label={`Cumulative vesting of ${symbol}. ${formatAmount(activeVested, decimals)} vested and ${formatAmount(
          activeClaimed,
          decimals,
        )} claimed as of ${formatDate(activeTime)}.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`vested-fill-${symbol}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#167a55" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#167a55" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {!compactMode
          ? [0, 0.5, 1].map((ratio) => {
              const y = padding.top + plotH * ratio;
              const value = BigInt(Math.round(model.peak * (1 - ratio)));
              return (
                <g key={ratio}>
                  <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y}
                    y2={y}
                    className="curve-grid"
                  />
                  <text x={padding.left - 8} y={y + 3.5} className="curve-axis" textAnchor="end">
                    {compact(value, decimals)}
                  </text>
                </g>
              );
            })
          : null}

        <path d={areaPath} fill={`url(#vested-fill-${symbol})`} />
        <path d={vestedPath} className="curve-line-vested" />
        {showClaimed ? <path d={claimedPath} className="curve-line-claimed" /> : null}

        {now >= from && now <= to ? (
          <g>
            <line
              x1={xFor(now)}
              x2={xFor(now)}
              y1={padding.top}
              y2={baseline}
              className="curve-now"
            />
            <text
              x={xFor(now)}
              y={padding.top + 9}
              className="curve-now-label"
              textAnchor={xFor(now) > width - 70 ? "end" : "start"}
              dx={xFor(now) > width - 70 ? -4 : 4}
            >
              Now
            </text>
          </g>
        ) : null}

        {hover !== null ? (
          <g>
            <line
              x1={xFor(activeTime)}
              x2={xFor(activeTime)}
              y1={padding.top}
              y2={baseline}
              className="curve-hover-line"
            />
            <circle cx={xFor(activeTime)} cy={yFor(activeVested)} r="3.4" className="curve-dot" />
          </g>
        ) : null}

        {!compactMode
          ? [from, from + (to - from) / 2n, to].map((timestamp, index) => (
              <text
                key={timestamp.toString()}
                x={xFor(timestamp)}
                y={height - 6}
                className="curve-axis"
                textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
              >
                {formatDate(timestamp)}
              </text>
            ))
          : null}
      </svg>

      {hover !== null ? (
        <div
          className="curve-tooltip"
          style={{ left: `${(xFor(activeTime) / width) * 100}%` }}
          role="status"
        >
          <span className="curve-tooltip-date">{formatDate(activeTime)}</span>
          <span>
            <i className="legend-dot vested" /> Vested{" "}
            <strong>
              {formatAmount(activeVested, decimals)} {symbol}
            </strong>
          </span>
          {showClaimed ? (
            <span>
              <i className="legend-dot claimed" /> Claimed{" "}
              <strong>
                {formatAmount(activeClaimed, decimals)} {symbol}
              </strong>
            </span>
          ) : null}
          <span>
            <i className="legend-dot locked" /> Locked{" "}
            <strong>
              {formatAmount(activeLocked, decimals)} {symbol}
            </strong>
          </span>
        </div>
      ) : null}

      <p className="curve-caption">
        {items.length === 0
          ? "No schedules in this range."
          : `${formatPercent(model.allocated > 0n ? model.vested[model.vested.length - 1] : 0n, model.allocated)} of ${formatAmount(
              model.allocated,
              decimals,
            )} ${symbol} vested by ${formatDate(to)}.`}
      </p>
    </div>
  );
}

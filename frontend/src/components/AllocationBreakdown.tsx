import { formatAmount, formatPercent } from "../lib/format";
import type { Schedule } from "../lib/types";

export function AllocationBreakdown({ schedule }: { schedule: Schedule }) {
  const locked = schedule.total > schedule.vested ? schedule.total - schedule.vested : 0n;
  const rows = [
    {
      key: "claimed",
      label: "Claimed",
      value: schedule.claimed,
      hint: "Paid to the beneficiary",
    },
    {
      key: "claimable",
      label: "Available to claim",
      value: schedule.claimable,
      hint: "Vested and unclaimed right now",
    },
    {
      key: "locked",
      label: "Still locked",
      value: locked,
      hint: "Not yet vested",
    },
  ];

  const percent = (value: bigint) =>
    Number(formatPercent(value, schedule.total, 2).replace("%", ""));

  return (
    <div className="breakdown">
      <div className="breakdown-bar" role="img" aria-label="Allocation breakdown">
        {rows.map((row) => {
          const width = schedule.total === 0n ? 0 : percent(row.value);
          return width > 0 ? (
            <span
              key={row.key}
              className={`breakdown-seg seg-${row.key}`}
              style={{ width: `${width}%` }}
            />
          ) : null;
        })}
      </div>
      <ul className="breakdown-legend">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="breakdown-key">
              <i className={`legend-dot ${row.key}`} />
              {row.label}
            </span>
            <span className="breakdown-value">
              {formatAmount(row.value, schedule.token.decimals)}{" "}
              <em>{schedule.token.symbol}</em>
            </span>
            <span className="breakdown-percent">{formatPercent(row.value, schedule.total)}</span>
            <span className="breakdown-hint">{row.hint}</span>
          </li>
        ))}
      </ul>
      <p className="breakdown-note">
        Vested amounts are claimable immediately after the cliff. VestiRail does not withhold
        accrued tokens, so there is no separate “accrued but unavailable” bucket.
      </p>
    </div>
  );
}

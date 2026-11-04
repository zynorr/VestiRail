import type { Schedule } from "../lib/types";
import { formatDate, formatDateTime } from "../lib/format";
import { Tip } from "./ui";

export function VestingTimeline({
  schedule,
  now,
  compact = false,
}: {
  schedule: Schedule;
  now: bigint;
  compact?: boolean;
}) {
  const points = [
    {
      key: "start",
      label: "Start",
      at: schedule.start,
      detail: "Accrual begins",
    },
    {
      key: "cliff",
      label: schedule.cliffDuration > 0n ? "Cliff" : "No cliff",
      at: schedule.cliffAt,
      detail:
        schedule.cliffDuration > 0n
          ? "First claim available"
          : "Claimable from start",
    },
    {
      key: "now",
      label: "Now",
      at: now,
      detail: "Current chain time",
    },
    {
      key: "end",
      label: "Fully vested",
      at: schedule.endedAt,
      detail: "100% of allocation",
    },
  ];

  const span = schedule.duration > 0n ? schedule.duration : 1n;
  const progress = Math.max(
    0,
    Math.min(100, (Number(now - schedule.start) / Number(span)) * 100),
  );

  return (
    <div className={`vesting-timeline ${compact ? "is-compact" : ""}`.trim()}>
      <div className="timeline-track">
        <span className="timeline-fill" style={{ width: `${progress}%` }} />
        {schedule.cliffDuration > 0n ? (
          <span
            className="timeline-cliff"
            style={{
              left: `${Math.min(
                100,
                (Number(schedule.cliffDuration) / Number(span)) * 100,
              )}%`,
            }}
          >
            <Tip text="Cliff: nothing is claimable before this point">
              <span className="timeline-cliff-mark" />
            </Tip>
          </span>
        ) : null}
        <span className="timeline-now" style={{ left: `${progress}%` }} />
      </div>

      <div className="timeline-points">
        {points.map((point) => {
          const state =
            point.at < now ? "past" : point.key === "now" ? "current" : "future";
          return (
            <div className={`timeline-point is-${state}`} key={point.key}>
              <span className="timeline-point-dot" />
              <span className="timeline-point-label">{point.label}</span>
              <span className="timeline-point-date">
                {compact ? formatDate(point.at) : formatDateTime(point.at)}
              </span>
              {!compact ? <span className="timeline-point-detail">{point.detail}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

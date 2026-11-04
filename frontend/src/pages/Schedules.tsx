import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context/WorkspaceContext";
import { scheduleStatus, totalsByToken } from "../lib/derive";
import { downloadCsv, formatAmount, formatDateTime } from "../lib/format";
import { getLabel } from "../lib/labels";
import type { ScheduleStatus } from "../lib/types";
import { ScheduleTable } from "../components/ScheduleTable";
import { Icon } from "../components/Icon";
import { Button, EmptyState, Notice, Tabs } from "../components/ui";

type View = "all" | ScheduleStatus;

export function Schedules() {
  const { workspace, loading, error, refresh } = useWorkspace();
  const [view, setView] = useState<View>("all");

  const schedules = workspace?.schedules ?? [];
  const now = workspace?.chainNow ?? 0n;
  const totals = useMemo(() => totalsByToken(schedules), [schedules]);

  const counts = useMemo(() => {
    const base: Record<View, number> = {
      all: schedules.length,
      upcoming: 0,
      active: 0,
      claimable: 0,
      completed: 0,
      "fully-claimed": 0,
    };
    for (const schedule of schedules) base[scheduleStatus(schedule, now)] += 1;
    return base;
  }, [schedules, now]);

  const visible = useMemo(
    () =>
      view === "all"
        ? schedules
        : schedules.filter((schedule) => scheduleStatus(schedule, now) === view),
    [schedules, view, now],
  );

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      [
        "Schedule ID",
        "Beneficiary",
        "Label",
        "Token",
        "Total allocation",
        "Claimed",
        "Remaining",
        "Start (UTC)",
        "Cliff (UTC)",
        "Fully vested (UTC)",
        "Status",
      ],
      ...visible.map((schedule) => [
        schedule.id.toString(),
        schedule.beneficiary,
        getLabel(schedule.id.toString())?.label ?? "",
        schedule.token.symbol,
        formatAmount(schedule.total, schedule.token.decimals, 18),
        formatAmount(schedule.claimed, schedule.token.decimals, 18),
        formatAmount(
          schedule.total > schedule.claimed ? schedule.total - schedule.claimed : 0n,
          schedule.token.decimals,
          18,
        ),
        formatDateTime(schedule.start),
        formatDateTime(schedule.cliffAt),
        formatDateTime(schedule.endedAt),
        scheduleStatus(schedule, now),
      ]),
    ];
    downloadCsv(`vestirail-schedules-${view}.csv`, rows);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Workspace / Schedules</p>
          <h1>Vesting schedules</h1>
          <p className="page-sub">
            Every allocation is an immutable on-chain record. Filter, inspect and export the
            complete register; financial actions stay with each beneficiary.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon="download" onClick={exportCsv} disabled={visible.length === 0}>
            Export view
          </Button>
          <Link to="/app/create">
            <Button variant="primary" icon="plus">
              Create schedule
            </Button>
          </Link>
        </div>
      </header>

      {error ? (
        <Notice
          tone="warn"
          title="Could not refresh contract state"
          action={
            <Button variant="secondary" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      ) : null}

      {totals.length > 0 ? (
        <div className="figures">
          <div className="figure">
            <span className="figure-label">Schedules</span>
            <span className="figure-value">{schedules.length}</span>
            <span className="figure-hint">Across {totals.length} token{totals.length === 1 ? "" : "s"}</span>
          </div>
          {totals.map((entry) => (
            <div className="figure" key={entry.token.address}>
              <span className="figure-label">{entry.token.symbol} allocated</span>
              <span className="figure-value">
                {formatAmount(entry.allocated, entry.token.decimals)} <em>{entry.token.symbol}</em>
              </span>
              <span className="figure-hint">
                {formatAmount(entry.claimable, entry.token.decimals)} claimable
              </span>
            </div>
          ))}
          <div className={`figure ${counts.claimable > 0 ? "is-accent" : ""}`.trim()}>
            <span className="figure-label">Awaiting claim</span>
            <span className="figure-value">{counts.claimable}</span>
            <span className="figure-hint">Schedules with a claimable balance</span>
          </div>
        </div>
      ) : null}

      <section className="panel">
        <div style={{ padding: "0 12px" }}>
          <Tabs
            items={[
              { value: "all", label: "All schedules", count: counts.all },
              { value: "active", label: "Active", count: counts.active },
              { value: "upcoming", label: "Upcoming", count: counts.upcoming },
              { value: "claimable", label: "Claimable", count: counts.claimable },
              { value: "completed", label: "Completed", count: counts.completed },
              { value: "fully-claimed", label: "Fully claimed", count: counts["fully-claimed"] },
            ]}
            value={view}
            onChange={setView}
            ariaLabel="Schedule status views"
          />
        </div>

        {!loading && schedules.length === 0 ? (
          <EmptyState
            icon="schedules"
            title="No schedules yet"
            description="Schedules appear here as soon as the VestingManager emits a creation event. Create one directly or upload a batch of allocations."
            action={
              <div className="row">
                <Link to="/app/create">
                  <Button variant="primary" icon="plus">
                    Create schedule
                  </Button>
                </Link>
                <Link to="/app/bulk">
                  <Button variant="secondary" icon="bulk">
                    Bulk allocations
                  </Button>
                </Link>
              </div>
            }
          />
        ) : (
          <ScheduleTable
            key={view}
            schedules={visible}
            now={now}
            initialStatus="all"
            pageSize={10}
            emptyMessage="No schedules match this status."
          />
        )}
      </section>

      <div className="batch-note">
        <Icon name="shield" size={15} />
        <span>
          VestiRail cannot revoke, transfer or withdraw a schedule on an operator&apos;s behalf.
          Bulk financial actions are intentionally absent; only the contract&apos;s own functions
          are exposed.
        </span>
      </div>
    </div>
  );
}

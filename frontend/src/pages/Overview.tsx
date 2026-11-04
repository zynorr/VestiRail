import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context/WorkspaceContext";
import { totalsByToken } from "../lib/derive";
import { formatAmount, formatDate } from "../lib/format";
import { getLabel } from "../lib/labels";
import type { Schedule } from "../lib/types";
import { scheduleStatus, nextUnlock } from "../lib/derive";
import { UnlockCurve } from "../components/UnlockCurve";
import { ScheduleTable } from "../components/ScheduleTable";
import { Icon } from "../components/Icon";
import {
  Button,
  EmptyState,
  Notice,
  Panel,
  PanelHead,
  Segmented,
  Skeleton,
  StatTile,
  StatusBadge,
} from "../components/ui";

type Frame = "30d" | "90d" | "12m" | "all";

const DAY = 86_400n;

const frameLabels: { value: Frame; label: string }[] = [
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "12m", label: "12M" },
  { value: "all", label: "All time" },
];

export function Overview() {
  const { workspace, loading, error, refresh, lastSyncedAt } = useWorkspace();
  const [frame, setFrame] = useState<Frame>("90d");
  const [tokenKey, setTokenKey] = useState<string>("");

  const schedules = workspace?.schedules ?? [];
  const now = workspace?.chainNow ?? 0n;
  const totals = useMemo(() => totalsByToken(schedules), [schedules]);

  const activeTotals =
    totals.find((entry) => entry.token.address === tokenKey) ?? totals[0] ?? null;

  const range = useMemo(() => {
    const spanDays = frame === "30d" ? 30n : frame === "90d" ? 90n : 365n;
    if (schedules.length === 0) return { from: now - 30n * DAY, to: now };
    const starts = schedules.map((schedule) => schedule.start);
    const ends = schedules.map((schedule) => schedule.endedAt);
    const earliest = starts.reduce((min, value) => (value < min ? value : min));
    const latest = ends.reduce((max, value) => (value > max ? value : max));
    if (frame === "all") {
      return { from: earliest < now ? earliest : now - 30n * DAY, to: latest > now ? latest : now };
    }
    const from = now - spanDays * DAY;
    const to = now > latest ? now : latest;
    return { from, to: to > from ? to : from + DAY };
  }, [frame, now, schedules]);

  const chartSchedules = useMemo<Schedule[]>(
    () =>
      activeTotals
        ? schedules.filter(
            (schedule) =>
              schedule.token.address.toLowerCase() ===
              activeTotals.token.address.toLowerCase(),
          )
        : [],
    [activeTotals, schedules],
  );

  const upcoming = useMemo(() => {
    return schedules
      .map((schedule) => ({ schedule, unlock: nextUnlock(schedule, now) }))
      .filter(
        (entry): entry is { schedule: Schedule; unlock: NonNullable<ReturnType<typeof nextUnlock>> } =>
          entry.unlock !== null && entry.unlock.amount > 0n && entry.schedule.claimable === 0n,
      )
      .sort((a, b) => Number(a.unlock.at - b.unlock.at))
      .slice(0, 5);
  }, [schedules, now]);

  const hasSchedules = schedules.length > 0;
  const totalSchedules = schedules.length;
  const claimableCount = schedules.filter((schedule) => schedule.claimable > 0n).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Workspace / Overview</p>
          <h1>Overview</h1>
          <p className="page-sub">
            Monitor your token allocations, vesting schedules and upcoming releases. Every figure
            is read from the VestingManager contract on BOT Chain.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/app/reports">
            <Button variant="secondary" icon="download">
              Export
            </Button>
          </Link>
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
          title="Contract state may be out of date"
          action={
            <Button variant="secondary" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {error}
          {lastSyncedAt ? ` Last successful sync ${formatDate(BigInt(Math.floor(lastSyncedAt.getTime() / 1000)))}.` : ""}
        </Notice>
      ) : null}

      {loading && !workspace ? (
        <div className="skeleton-page">
          <div className="skeleton-grid">
            {[0, 1, 2, 3].map((key) => (
              <div className="stat-tile" key={key}>
                <Skeleton height={10} />
                <Skeleton height={26} />
                <Skeleton height={10} />
              </div>
            ))}
          </div>
          <Panel>
            <div className="panel-body">
              <Skeleton height={260} />
            </div>
          </Panel>
        </div>
      ) : null}

      {!loading && !hasSchedules ? (
        <Panel>
          <EmptyState
            icon="spark"
            title="Your workspace is ready — create the first schedule"
            description="A vesting schedule locks an allocation to one beneficiary. Pick a token, set the amount and cliff, then fund the schedule in the same transaction. Nothing is fabricated here: this view stays empty until the contract has schedules."
            action={
              <div className="row">
                <Link to="/app/create">
                  <Button variant="primary" icon="plus">
                    Create vesting schedule
                  </Button>
                </Link>
                <Link to="/app/bulk">
                  <Button variant="secondary" icon="bulk">
                    Upload allocations
                  </Button>
                </Link>
              </div>
            }
          />
        </Panel>
      ) : null}

      {hasSchedules ? (
        <>
          <div className="stat-grid">
            <StatTile
              label="Total allocated"
              values={totals.map((entry) => ({
                value: formatAmount(entry.allocated, entry.token.decimals),
                unit: entry.token.symbol,
              }))}
              hint={`${totalSchedules} schedule${totalSchedules === 1 ? "" : "s"} on chain`}
              icon="lock"
            />
            <StatTile
              label="Total released"
              values={totals.map((entry) => ({
                value: formatAmount(entry.claimed, entry.token.decimals),
                unit: entry.token.symbol,
              }))}
              hint="Claimed by beneficiaries"
              icon="check"
            />
            <StatTile
              label="Currently locked"
              values={totals.map((entry) => ({
                value: formatAmount(entry.locked, entry.token.decimals),
                unit: entry.token.symbol,
              }))}
              hint="Not yet vested"
              icon="shield"
            />
            <StatTile
              label="Available to claim"
              values={totals.map((entry) => ({
                value: formatAmount(entry.claimable, entry.token.decimals),
                unit: entry.token.symbol,
              }))}
              hint={
                claimableCount > 0
                  ? `${claimableCount} schedule${claimableCount === 1 ? "" : "s"} can be claimed`
                  : "No claims outstanding"
              }
              emphasis={claimableCount > 0}
              icon="wallet"
            />
          </div>

          <div className="grid-2">
            <Panel>
              <PanelHead
                eyebrow="Allocation analytics"
                title="Vesting progress"
                description="Cumulative vested and claimed tokens across the selected window."
                actions={
                  <div className="row">
                    {totals.length > 1 ? (
                      <select
                        className="select select-sm"
                        value={activeTotals?.token.address ?? ""}
                        onChange={(event) => setTokenKey(event.target.value)}
                        aria-label="Token for chart"
                      >
                        {totals.map((entry) => (
                          <option key={entry.token.address} value={entry.token.address}>
                            {entry.token.symbol}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <Segmented
                      options={frameLabels}
                      value={frame}
                      onChange={setFrame}
                      ariaLabel="Chart timeframe"
                    />
                  </div>
                }
              />
              {activeTotals ? (
                <>
                  <div className="curve-meta">
                    <div>
                      <span>Scheduled</span>
                      <strong>
                        {formatAmount(activeTotals.allocated, activeTotals.token.decimals)}{" "}
                        {activeTotals.token.symbol}
                      </strong>
                    </div>
                    <div>
                      <span>Vested</span>
                      <strong>
                        {formatAmount(activeTotals.vested, activeTotals.token.decimals)}{" "}
                        {activeTotals.token.symbol}
                      </strong>
                    </div>
                    <div>
                      <span>Claimed</span>
                      <strong>
                        {formatAmount(activeTotals.claimed, activeTotals.token.decimals)}{" "}
                        {activeTotals.token.symbol}
                      </strong>
                    </div>
                    <div>
                      <span>Locked</span>
                      <strong>
                        {formatAmount(activeTotals.locked, activeTotals.token.decimals)}{" "}
                        {activeTotals.token.symbol}
                      </strong>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="chart-legend mb-12">
                      <span>
                        <i className="legend-swatch" /> Cumulative vested
                      </span>
                      <span>
                        <i className="legend-swatch claimed" /> Cumulative claimed
                      </span>
                      <span>
                        <i className="legend-swatch total" /> Scheduled total
                      </span>
                    </div>
                    <UnlockCurve
                      items={chartSchedules}
                      events={workspace?.events ?? []}
                      tokenAddress={activeTotals.token.address}
                      from={range.from}
                      to={range.to}
                      now={now}
                      symbol={activeTotals.token.symbol}
                      decimals={activeTotals.token.decimals}
                      showClaimed={workspace?.logsAvailable ?? false}
                    />
                    {workspace && !workspace.logsAvailable ? (
                      <p className="curve-caption">
                        Claim history is temporarily unavailable from the RPC event log, so the
                        claimed line is hidden. Vested values are computed from live schedule
                        state.
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </Panel>

            <Panel>
              <PanelHead
                eyebrow="Release queue"
                title="Upcoming unlocks"
                description="The next contractual releases, ordered by unlock time."
                actions={
                  <Link className="inline-link" to="/app/schedules">
                    All schedules <Icon name="arrowRight" size={13} />
                  </Link>
                }
              />
              {upcoming.length === 0 ? (
                <div className="panel-body">
                  <EmptyState
                    icon="clock"
                    title="Nothing scheduled next"
                    description="Either every remaining allocation is already claimable, or all schedules have been fully claimed."
                  />
                </div>
              ) : (
                <ul>
                  {upcoming.map(({ schedule, unlock }) => (
                    <li key={schedule.id.toString()}>
                      <Link
                        to={`/app/schedules/${schedule.id}`}
                        className="portal-schedule"
                        style={{ display: "flex" }}
                      >
                        <div className="portal-schedule-main">
                          <strong>
                            {getLabel(schedule.id.toString())?.label ?? `Schedule #${schedule.id}`}
                          </strong>
                          <span>
                            {schedule.beneficiary.slice(0, 6)}…{schedule.beneficiary.slice(-4)} ·{" "}
                            {unlock.kind === "cliff" ? "Cliff release" : unlock.kind === "available" ? "Available now" : "Daily accrual"}
                          </span>
                        </div>
                        <div className="portal-schedule-side">
                          <strong>
                            {formatAmount(unlock.amount, schedule.token.decimals)}{" "}
                            {schedule.token.symbol}
                          </strong>
                          <span>{formatDate(unlock.at)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel>
            <PanelHead
              title="Vesting schedules"
              description={`${totalSchedules} total · sorted by next unlock`}
              actions={
                <Link className="inline-link" to="/app/schedules">
                  Manage schedules <Icon name="arrowRight" size={13} />
                </Link>
              }
            />
            <ScheduleTable schedules={schedules} now={now} compact pageSize={5} />
          </Panel>

          <div className="grid-3">
            <Panel>
              <PanelHead title="Status mix" description="Derived from contract state" />
              <div className="panel-body">
                <ul className="breakdown-legend">
                  {(["claimable", "active", "upcoming", "completed", "fully-claimed"] as const).map(
                    (status) => {
                      const count = schedules.filter(
                        (schedule) => scheduleStatus(schedule, now) === status,
                      ).length;
                      return (
                        <li key={status}>
                          <span className="breakdown-key">
                            <StatusBadge status={status} />
                          </span>
                          <span className="breakdown-value">{count}</span>
                          <span className="breakdown-percent">schedules</span>
                        </li>
                      );
                    },
                  )}
                </ul>
              </div>
            </Panel>

            <Panel>
              <PanelHead title="Network" description="Read path and settlement" />
              <div className="panel-body">
                <dl className="data-list">
                  <div className="data-row">
                    <dt>Chain</dt>
                    <dd>BOT Chain Testnet · 968</dd>
                  </div>
                  <div className="data-row">
                    <dt>Latest block</dt>
                    <dd className="mono-sm">{workspace?.blockNumber ?? "—"}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Chain time</dt>
                    <dd>{now > 0n ? formatDate(now) : "—"}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Event log</dt>
                    <dd>{workspace?.logsAvailable ? "Available" : "Unavailable"}</dd>
                  </div>
                </dl>
              </div>
            </Panel>

            <Panel>
              <PanelHead title="Next steps" description="Operational shortcuts" />
              <div className="panel-body stack">
                <Link className="inline-link" to="/app/bulk">
                  Upload a batch of allocations <Icon name="arrowRight" size={13} />
                </Link>
                <Link className="inline-link" to="/app/beneficiaries">
                  Review beneficiary exposure <Icon name="arrowRight" size={13} />
                </Link>
                <Link className="inline-link" to="/app/activity">
                  Inspect on-chain activity <Icon name="arrowRight" size={13} />
                </Link>
                <Link className="inline-link" to="/app/tokens">
                  Token registry <Icon name="arrowRight" size={13} />
                </Link>
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}

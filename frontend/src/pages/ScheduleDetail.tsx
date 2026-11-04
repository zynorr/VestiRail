import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { vestedAmount } from "../../../shared/vesting";
import { CONFIG, EXPLORER } from "../lib/config";
import { nextUnlock, scheduleStatus } from "../lib/derive";
import { formatAmount, formatDateTime, formatPercent } from "../lib/format";
import { getLabel } from "../lib/labels";
import type { ChainEvent } from "../lib/types";
import { useWorkspace } from "../context/WorkspaceContext";
import { AllocationBreakdown } from "../components/AllocationBreakdown";
import { ClaimPanel } from "../components/ClaimPanel";
import { Icon } from "../components/Icon";
import { ScheduleTable } from "../components/ScheduleTable";
import { UnlockCurve } from "../components/UnlockCurve";
import { VestingTimeline } from "../components/VestingTimeline";
import {
  Button,
  CopyAddress,
  DataRow,
  EmptyState,
  Notice,
  Panel,
  PanelHead,
  Skeleton,
  StatusBadge,
} from "../components/ui";

const DAY = 86_400n;

function eventIcon(kind: ChainEvent["kind"]) {
  return kind === "created" ? "plus" : kind === "claimed" ? "check" : "beneficiaries";
}

function eventLabel(kind: ChainEvent["kind"]) {
  return kind === "created" ? "Schedule created" : kind === "claimed" ? "Claim paid" : "Beneficiary transferred";
}

export function ScheduleDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { workspace, loading, scheduleById } = useWorkspace();
  const [copied, setCopied] = useState(false);

  const schedule = scheduleById(id);
  const now = workspace?.chainNow ?? 0n;

  const creator = useMemo(() => {
    if (!schedule || !workspace) return null;
    return (
      workspace.events.find(
        (event) =>
          event.kind === "created" &&
          event.firstScheduleId !== undefined &&
          event.scheduleCount !== undefined &&
          schedule.id >= event.firstScheduleId &&
          schedule.id < event.firstScheduleId + event.scheduleCount,
      ) ?? null
    );
  }, [schedule, workspace]);

  const history = useMemo(() => {
    if (!schedule || !workspace) return [];
    return workspace.events.filter((event) => {
      if (event.kind === "created") {
        return (
          event.firstScheduleId !== undefined &&
          event.scheduleCount !== undefined &&
          schedule.id >= event.firstScheduleId &&
          schedule.id < event.firstScheduleId + event.scheduleCount
        );
      }
      return event.scheduleId === schedule.id;
    });
  }, [schedule, workspace]);

  const siblingSchedules = useMemo(() => {
    if (!schedule || !workspace) return [];
    return workspace.schedules.filter(
      (entry) =>
        entry.id !== schedule.id &&
        entry.beneficiary.toLowerCase() === schedule.beneficiary.toLowerCase(),
    );
  }, [schedule, workspace]);

  if (loading && !workspace) {
    return (
      <div className="page">
        <div className="skeleton-page">
          <Skeleton height={30} />
          <Skeleton height={90} />
          <Skeleton height={320} />
        </div>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="page">
        <Panel>
          <EmptyState
            icon="alert"
            title={`Schedule #${id} was not found`}
            description="The VestingManager has no record with this ID. If the schedule was created moments ago, refresh the contract state."
            action={
              <Link to="/app/schedules">
                <Button variant="primary" icon="arrowLeft">
                  Back to schedules
                </Button>
              </Link>
            }
          />
        </Panel>
      </div>
    );
  }

  const meta = schedule.token;
  const status = scheduleStatus(schedule, now);
  const unlock = nextUnlock(schedule, now);
  const locked = schedule.total > schedule.vested ? schedule.total - schedule.vested : 0n;
  const firstClaim =
    schedule.cliffDuration > 0n
      ? vestedAmount(
          {
            totalAmount: schedule.total,
            start: schedule.start,
            cliffDuration: schedule.cliffDuration,
            duration: schedule.duration,
          },
          schedule.cliffAt,
        )
      : 0n;
  const label = getLabel(schedule.id.toString());
  const from = (schedule.start < now ? schedule.start : now) - 5n * DAY;
  const to = (schedule.endedAt > now ? schedule.endedAt : now) + 5n * DAY;
  const durationHours = Number(schedule.duration) / 3600;
  const durationLabel =
    schedule.duration < DAY
      ? `${durationHours.toFixed(durationHours % 1 === 0 ? 0 : 1)} hour${durationHours === 1 ? "" : "s"}`
      : `${(Number(schedule.duration) / Number(DAY)).toFixed(0)} days`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/schedules/${schedule.id}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="page">
      <div>
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/app">Overview</Link>
          <span>/</span>
          <Link to="/app/schedules">Vesting schedules</Link>
          <span>/</span>
          <span>#{schedule.id.toString()}</span>
        </nav>
        <header className="page-head">
          <div>
            <div className="badge-row">
              <h1>Schedule #{schedule.id.toString()}</h1>
              <StatusBadge status={status} />
            </div>
            <div className="kv-inline" style={{ marginTop: 6 }}>
              <span>Beneficiary</span>
              <CopyAddress address={schedule.beneficiary} chars={6} />
              {label ? (
                <>
                  <span>·</span>
                  <span>{label.label}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="page-actions">
            <Button variant="secondary" icon="copy" onClick={() => void copyLink()}>
              {copied ? "Link copied" : "Copy link"}
            </Button>
            <a href={EXPLORER.address(CONFIG.manager)} target="_blank" rel="noreferrer">
              <Button variant="primary" icon="external">
                View on BOTScan
              </Button>
            </a>
          </div>
        </header>
      </div>

      <div className="figures">
        <div className="figure">
          <span className="figure-label">Total allocation</span>
          <span className="figure-value">
            {formatAmount(schedule.total, meta.decimals, 18)} <em>{meta.symbol}</em>
          </span>
          <span className="figure-hint">Immutable after creation</span>
        </div>
        <div className="figure">
          <span className="figure-label">Vested</span>
          <span className="figure-value">
            {formatAmount(schedule.vested, meta.decimals, 18)} <em>{meta.symbol}</em>
          </span>
          <span className="figure-hint">{formatPercent(schedule.vested, schedule.total)} of allocation</span>
        </div>
        <div className="figure">
          <span className="figure-label">Claimed</span>
          <span className="figure-value">
            {formatAmount(schedule.claimed, meta.decimals, 18)} <em>{meta.symbol}</em>
          </span>
          <span className="figure-hint">{formatPercent(schedule.claimed, schedule.total)} of allocation</span>
        </div>
        <div className={`figure ${schedule.claimable > 0n ? "is-accent" : ""}`.trim()}>
          <span className="figure-label">Available to claim</span>
          <span className="figure-value">
            {formatAmount(schedule.claimable, meta.decimals, 18)} <em>{meta.symbol}</em>
          </span>
          <span className="figure-hint">
            {unlock
              ? unlock.kind === "available"
                ? "Unclaimed balance available now"
                : `Next release ${formatDateTime(unlock.at)}`
              : "No further releases"}
          </span>
        </div>
        <div className="figure">
          <span className="figure-label">Still locked</span>
          <span className="figure-value">
            {formatAmount(locked, meta.decimals, 18)} <em>{meta.symbol}</em>
          </span>
          <span className="figure-hint">Vests through {formatDateTime(schedule.endedAt)}</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack-16">
          <Panel>
            <PanelHead
              eyebrow="Primary visualisation"
              title="Vesting progress"
              description="The curve is drawn with the same integer formula the contract executes."
              actions={<span className="badge-row"><span className="legend-swatch" /> Vested <span className="legend-swatch claimed" /> Claimed</span>}
            />
            <div className="panel-body">
              <UnlockCurve
                items={[schedule]}
                events={workspace?.events ?? []}
                tokenAddress={meta.address}
                from={from}
                to={to}
                now={now}
                height={280}
                symbol={meta.symbol}
                decimals={meta.decimals}
                showClaimed={workspace?.logsAvailable ?? false}
              />
              {workspace && !workspace.logsAvailable ? (
                <Notice tone="info" title="Claim history unavailable">
                  The RPC event query failed, so the claimed line is hidden. Vested and claimable
                  values still come from live contract state.
                </Notice>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="Vesting timeline"
              description={`${durationLabel} linear release${
                schedule.cliffDuration > 0n ? " after a cliff" : " with no cliff"
              }`}
            />
            <div className="panel-body">
              <VestingTimeline schedule={schedule} now={now} />
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="Transaction history"
              description="On-chain events associated with this schedule."
              actions={
                <Link className="inline-link" to="/app/activity">
                  All activity <Icon name="arrowRight" size={13} />
                </Link>
              }
            />
            {history.length === 0 ? (
              <div className="panel-body">
                <EmptyState
                  icon="activity"
                  title="No indexed events"
                  description={
                    workspace?.logsAvailable
                      ? "The contract has no claim, transfer or creation event for this schedule yet."
                      : "The event log is unavailable right now. Contract balances above remain authoritative."
                  }
                />
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Event</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Detail</th>
                      <th scope="col">Timestamp</th>
                      <th scope="col">Block</th>
                      <th scope="col">Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((event) => (
                      <tr key={event.key}>
                        <td>
                          <span className={`event-icon ${event.kind}`} style={{ display: "inline-grid", marginRight: 8 }}>
                            <Icon name={eventIcon(event.kind)} size={13} />
                          </span>
                          <span className="is-strong" style={{ fontWeight: 550 }}>
                            {eventLabel(event.kind)}
                          </span>
                        </td>
                        <td className="is-numeric">
                          {event.amount !== undefined
                            ? `${formatAmount(event.amount, meta.decimals)} ${meta.symbol}`
                            : "—"}
                        </td>
                        <td>
                          {event.kind === "claimed" && event.beneficiary ? (
                            <CopyAddress address={event.beneficiary} chars={4} />
                          ) : event.kind === "created" && event.funder ? (
                            <CopyAddress address={event.funder} chars={4} label="Funder" />
                          ) : event.kind === "transferred" && event.newBeneficiary ? (
                            <CopyAddress address={event.newBeneficiary} chars={4} label="To" />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{formatDateTime(event.timestamp)}</td>
                        <td className="mono-sm">{event.blockNumber}</td>
                        <td>
                          <a
                            className="inline-link mono-sm"
                            href={EXPLORER.tx(event.txHash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {event.txHash.slice(0, 10)}… <Icon name="external" size={11} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="stack-16">
          <ClaimPanel schedule={schedule} />

          <Panel>
            <PanelHead title="Allocation breakdown" description="Accrual versus distribution" />
            <div className="panel-body">
              <AllocationBreakdown schedule={schedule} />
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Schedule terms" description="Values stored in the contract" />
            <div className="panel-body">
              <dl className="data-list">
                <DataRow label="Token">
                  <span className="badge-row">
                    <span>{meta.name}</span>
                    <span className="mono-sm">{meta.symbol}</span>
                  </span>
                </DataRow>
                <DataRow label="Token contract">
                  <CopyAddress address={meta.address === CONFIG.demoToken.address ? meta.address : meta.address} chars={5} />
                </DataRow>
                <DataRow label="Decimals">{meta.decimals}</DataRow>
                <DataRow label="Starts">{formatDateTime(schedule.start)}</DataRow>
                <DataRow label={schedule.cliffDuration === 0n ? "Cliff" : "Cliff ends"}>
                  {schedule.cliffDuration === 0n ? "No cliff" : formatDateTime(schedule.cliffAt)}
                </DataRow>
                <DataRow label="Cliff length">
                  {schedule.cliffDuration === 0n
                    ? "—"
                    : `${(Number(schedule.cliffDuration) / Number(DAY)).toFixed(0)} days`}
                </DataRow>
                <DataRow label="Fully vested">{formatDateTime(schedule.endedAt)}</DataRow>
                <DataRow label="Release method">Cliff + linear, claim on demand</DataRow>
                <DataRow label="Created by">
                  {creator?.funder ? <CopyAddress address={creator.funder} chars={4} /> : "—"}
                </DataRow>
                <DataRow label="Creation tx">
                  {creator ? (
                    <a className="inline-link mono-sm" href={EXPLORER.tx(creator.txHash)} target="_blank" rel="noreferrer">
                      {creator.txHash.slice(0, 10)}… <Icon name="external" size={11} />
                    </a>
                  ) : (
                    "—"
                  )}
                </DataRow>
              </dl>
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Milestones" description="Contractual release points" />
            <div className="panel-body">
              <dl className="data-list">
                <DataRow label="Start">{formatDateTime(schedule.start)}</DataRow>
                <DataRow label="Cliff unlocks">
                  {schedule.cliffDuration === 0n ? "No cliff" : formatDateTime(schedule.cliffAt)}
                </DataRow>
                <DataRow label="First claimable">
                  {schedule.cliffDuration === 0n
                    ? "At start"
                    : `${formatAmount(firstClaim, meta.decimals)} ${meta.symbol}`}
                </DataRow>
                <DataRow label="Next unlock">
                  {unlock ? formatDateTime(unlock.at) : "None"}
                </DataRow>
                <DataRow label="Final unlock">{formatDateTime(schedule.endedAt)}</DataRow>
                <DataRow label="Final amount">
                  {formatAmount(schedule.total, meta.decimals)} {meta.symbol}
                </DataRow>
              </dl>
            </div>
          </Panel>
        </div>
      </div>

      {siblingSchedules.length > 0 ? (
        <Panel>
          <PanelHead
            title="Other schedules for this beneficiary"
            description="Each schedule has independent vesting mathematics."
            actions={
              <Link className="inline-link" to="/app/beneficiaries">
                Beneficiary register <Icon name="arrowRight" size={13} />
              </Link>
            }
          />
          <ScheduleTable schedules={siblingSchedules} now={now} compact pageSize={5} />
        </Panel>
      ) : null}

      <div className="batch-note">
        <Icon name="shield" size={15} />
        <span>
          Schedule #{schedule.id.toString()} is immutable. VestiRail can read it, but only the
          beneficiary can claim and only the contract decides how much is vested.
        </span>
        <button className="inline-link" type="button" onClick={() => navigate("/app/schedules")}>
          Back to register
        </button>
      </div>
    </div>
  );
}

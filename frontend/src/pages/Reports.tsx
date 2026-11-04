import { useMemo } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { CONFIG, EXPLORER } from "../lib/config";
import { aggregateBeneficiaries, nextUnlock, scheduleStatus, totalsByToken } from "../lib/derive";
import { downloadCsv, formatAmount, formatDateTime } from "../lib/format";
import { getLabel } from "../lib/labels";
import { Icon } from "../components/Icon";
import { Button, CopyAddress, Notice, Panel, PanelHead } from "../components/ui";

export function Reports() {
  const { workspace, loading, error, refresh, lastSyncedAt } = useWorkspace();
  const schedules = workspace?.schedules ?? [];
  const now = workspace?.chainNow ?? 0n;
  const totals = useMemo(() => totalsByToken(schedules), [schedules]);
  const beneficiaries = useMemo(() => aggregateBeneficiaries(schedules, now), [schedules, now]);

  const claims = workspace?.events.filter((event) => event.kind === "claimed") ?? [];
  const upcoming = useMemo(
    () =>
      schedules
        .map((schedule) => ({ schedule, unlock: nextUnlock(schedule, now) }))
        .filter((entry) => entry.unlock !== null && entry.unlock.amount > 0n)
        .sort((a, b) => Number((a.unlock?.at ?? 0n) - (b.unlock?.at ?? 0n))),
    [schedules, now],
  );
  const completed = schedules.filter((schedule) => scheduleStatus(schedule, now) === "completed");

  const meta = (name: string) => [
    `VestiRail report: ${name}`,
    `Source: VestingManager ${CONFIG.manager} on ${CONFIG.chainName} (chain ${CONFIG.chainId})`,
    `Chain time: ${now > 0n ? formatDateTime(now) : "unavailable"} · block ${workspace?.blockNumber ?? "—"}`,
    "",
  ];

  const exportAllocation = () => {
    const rows: (string | number)[][] = [
      ...meta("Allocation summary").map((line) => [line]),
      ["Token", "Schedules", "Total allocated", "Vested", "Claimed", "Available to claim", "Locked"],
      ...totals.map((entry) => [
        entry.token.symbol,
        schedules.filter((schedule) => schedule.token.address === entry.token.address).length,
        formatAmount(entry.allocated, entry.token.decimals, 18),
        formatAmount(entry.vested, entry.token.decimals, 18),
        formatAmount(entry.claimed, entry.token.decimals, 18),
        formatAmount(entry.claimable, entry.token.decimals, 18),
        formatAmount(entry.locked, entry.token.decimals, 18),
      ]),
    ];
    downloadCsv("vestirail-allocation-summary.csv", rows);
  };

  const exportBeneficiaries = () => {
    const rows: (string | number)[][] = [
      ...meta("Beneficiary summary").map((line) => [line]),
      ["Beneficiary", "Token", "Schedules", "Total allocated", "Claimed", "Remaining"],
      ...beneficiaries.map((row) => [
        row.address,
        row.token.symbol,
        row.scheduleIds.length,
        formatAmount(row.allocated, row.token.decimals, 18),
        formatAmount(row.claimed, row.token.decimals, 18),
        formatAmount(row.remaining, row.token.decimals, 18),
      ]),
    ];
    downloadCsv("vestirail-beneficiary-summary.csv", rows);
  };

  const exportDistribution = () => {
    const rows: (string | number)[][] = [
      ...meta("Token distribution").map((line) => [line]),
      ["Token", "Contract", "Decimals", "Allocated", "Released %", "Locked"],
      ...totals.map((entry) => [
        entry.token.symbol,
        entry.token.address,
        entry.token.decimals,
        formatAmount(entry.allocated, entry.token.decimals, 18),
        entry.allocated === 0n ? "0" : ((Number(entry.claimed) / Number(entry.allocated)) * 100).toFixed(2),
        formatAmount(entry.locked, entry.token.decimals, 18),
      ]),
    ];
    downloadCsv("vestirail-token-distribution.csv", rows);
  };

  const exportClaims = () => {
    const rows: (string | number)[][] = [
      ...meta("Claim history").map((line) => [line]),
      ["Schedule", "Beneficiary", "Token", "Amount (base units)", "Timestamp (UTC)", "Block", "Transaction"],
      ...claims.map((event) => [
        event.scheduleId !== undefined ? `#${event.scheduleId}` : "",
        event.beneficiary ?? "",
        event.token.symbol,
        event.amount?.toString() ?? "",
        formatDateTime(event.timestamp),
        event.blockNumber,
        event.txHash,
      ]),
    ];
    downloadCsv("vestirail-claim-history.csv", rows);
  };

  const exportUpcoming = () => {
    const rows: (string | number)[][] = [
      ...meta("Upcoming unlock report").map((line) => [line]),
      ["Schedule", "Beneficiary", "Label", "Token", "Unlock amount", "Unlock (UTC)", "Release type"],
      ...upcoming.map(({ schedule, unlock }) => [
        `#${schedule.id}`,
        schedule.beneficiary,
        getLabel(schedule.id.toString())?.label ?? "",
        schedule.token.symbol,
        unlock ? formatAmount(unlock.amount, schedule.token.decimals, 18) : "",
        unlock ? formatDateTime(unlock.at) : "",
        unlock?.kind === "cliff" ? "cliff" : unlock?.kind === "available" ? "available" : "linear accrual",
      ]),
    ];
    downloadCsv("vestirail-upcoming-unlocks.csv", rows);
  };

  const exportCompleted = () => {
    const rows: (string | number)[][] = [
      ...meta("Completed vesting").map((line) => [line]),
      ["Schedule", "Beneficiary", "Token", "Allocation", "Claimed", "Unclaimed", "Fully vested (UTC)"],
      ...completed.map((schedule) => [
        `#${schedule.id}`,
        schedule.beneficiary,
        schedule.token.symbol,
        formatAmount(schedule.total, schedule.token.decimals, 18),
        formatAmount(schedule.claimed, schedule.token.decimals, 18),
        formatAmount(schedule.total - schedule.claimed, schedule.token.decimals, 18),
        formatDateTime(schedule.endedAt),
      ]),
    ];
    downloadCsv("vestirail-completed-vesting.csv", rows);
  };

  const reports = [
    {
      title: "Allocation summary",
      description: "Per-token scheduled, vested, claimed, claimable and locked totals.",
      count: `${totals.length} tokens`,
      action: exportAllocation,
    },
    {
      title: "Beneficiary summary",
      description: "Every beneficiary and token pair with allocations, claims and remaining balance.",
      count: `${beneficiaries.length} rows`,
      action: exportBeneficiaries,
    },
    {
      title: "Token distribution",
      description: "Distribution ratios per token, including contract addresses and decimals.",
      count: `${schedules.length} schedules`,
      action: exportDistribution,
    },
    {
      title: "Claim history",
      description: "Chronological claim events decoded from contract logs with transaction hashes.",
      count: `${claims.length} claims`,
      action: exportClaims,
    },
    {
      title: "Upcoming unlock report",
      description: "Next release per schedule, ordered by unlock timestamp.",
      count: `${upcoming.length} releases`,
      action: exportUpcoming,
    },
    {
      title: "Completed vesting",
      description: "Schedules past their final vesting date, with any unclaimed remainder.",
      count: `${completed.length} completed`,
      action: exportCompleted,
    },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Workspace / Reports</p>
          <h1>Reports</h1>
          <p className="page-sub">
            Operational exports generated from contract reads at the reported chain time. Nothing
            is stored server-side; each file reflects the node&apos;s state when generated.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon="refresh" onClick={() => void refresh()}>
            Refresh state
          </Button>
        </div>
      </header>

      {error ? (
        <Notice tone="warn" title="Report data may be stale">
          {error}
        </Notice>
      ) : null}

      <div className="chart-legend" style={{ gap: 18, flexWrap: "wrap" }}>
        <span>
          <Icon name="shield" size={13} /> Source: VestingManager contract
        </span>
        <span>
          <Icon name="clock" size={13} /> Chain time {now > 0n ? formatDateTime(now) : "unavailable"}
        </span>
        <span>
          <Icon name="refresh" size={13} /> Last sync{" "}
          {lastSyncedAt ? lastSyncedAt.toLocaleTimeString("en-GB", { hour12: false }) : "—"}
        </span>
        {workspace && !workspace.logsAvailable ? (
          <span className="badge badge-warn">Claim history unavailable</span>
        ) : null}
      </div>

      <div className="report-grid">
        {reports.map((report) => (
          <article className="report-card" key={report.title}>
            <div className="between">
              <h3>{report.title}</h3>
              <span className="badge badge-neutral">{report.count}</span>
            </div>
            <p>{report.description}</p>
            <Button variant="secondary" size="sm" icon="download" onClick={report.action} disabled={loading && !workspace}>
              Download CSV
            </Button>
          </article>
        ))}
      </div>

      <Panel>
        <PanelHead
          title="Report integrity"
          description="What these exports do and do not claim."
        />
        <div className="panel-body stack-16">
          <dl className="data-list">
            <div className="data-row">
              <dt>Contract</dt>
              <dd>
                <CopyAddress address={CONFIG.manager} chars={6} />
              </dd>
            </div>
            <div className="data-row">
              <dt>Explorer</dt>
              <dd>
                <a className="inline-link" href={EXPLORER.address(CONFIG.manager)} target="_blank" rel="noreferrer">
                  BOTScan <Icon name="external" size={12} />
                </a>
              </dd>
            </div>
            <div className="data-row">
              <dt>Read block</dt>
              <dd className="mono-sm">{workspace?.blockNumber ?? "—"}</dd>
            </div>
            <div className="data-row">
              <dt>Event coverage</dt>
              <dd>{workspace?.logsAvailable ? "Creation, claim and transfer logs" : "Unavailable"}</dd>
            </div>
          </dl>
          <p className="breakdown-note">
            Vested and claimable amounts are computed with the exact integer formula deployed in
            the contract at the reported chain timestamp. Report rows do not include off-chain
            labels unless they live in this browser, and labels are marked as local. Amounts are
            exported in whole token units with 18 decimal places; base-unit precision remains
            available on each schedule page.
          </p>
        </div>
      </Panel>
    </div>
  );
}

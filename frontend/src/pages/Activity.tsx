import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context/WorkspaceContext";
import { CONFIG, EXPLORER } from "../lib/config";
import { downloadCsv, formatAmount, formatDateTime, shortAddress } from "../lib/format";
import type { ChainEventKind } from "../lib/types";
import { Icon } from "../components/Icon";
import {
  Button,
  CopyAddress,
  EmptyState,
  Notice,
  Pagination,
  Panel,
  Tabs,
} from "../components/ui";

type KindFilter = "all" | ChainEventKind;

const kindMeta: Record<ChainEventKind, { label: string; icon: "plus" | "check" | "beneficiaries" }> = {
  created: { label: "Schedules created", icon: "plus" },
  claimed: { label: "Claim paid", icon: "check" },
  transferred: { label: "Beneficiary transferred", icon: "beneficiaries" },
};

export function Activity() {
  const { workspace, loading, error, refresh, lastSyncedAt } = useWorkspace();
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const events = workspace?.events ?? [];
  const symbols = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) map.set(event.kind, (map.get(event.kind) ?? 0) + 1);
    return map;
  }, [events]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return events.filter((event) => {
      if (kind !== "all" && event.kind !== kind) return false;
      if (!text) return true;
      return (
        event.txHash.toLowerCase().includes(text) ||
        event.token.symbol.toLowerCase().includes(text) ||
        (event.scheduleId !== undefined && event.scheduleId.toString().includes(text)) ||
        (event.beneficiary?.toLowerCase().includes(text) ?? false) ||
        (event.newBeneficiary?.toLowerCase().includes(text) ?? false) ||
        (event.funder?.toLowerCase().includes(text) ?? false)
      );
    });
  }, [events, kind, query]);

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ["Type", "Schedule", "Token", "Amount (base units)", "Wallet", "Timestamp (UTC)", "Block", "Transaction"],
      ...filtered.map((event) => [
        event.kind,
        event.scheduleId !== undefined
          ? `#${event.scheduleId}`
          : event.firstScheduleId !== undefined
            ? `#${event.firstScheduleId}+${event.scheduleCount ?? 0}`
            : "",
        event.token.symbol,
        event.amount !== undefined ? event.amount.toString() : "",
        event.beneficiary ?? event.newBeneficiary ?? event.funder ?? "",
        formatDateTime(event.timestamp),
        event.blockNumber,
        event.txHash,
      ]),
    ];
    downloadCsv("vestirail-activity.csv", rows);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Workspace / Activity</p>
          <h1>Activity</h1>
          <p className="page-sub">
            Every event emitted by the VestingManager since deployment. Amounts are decoded from
            the contract logs, not reconstructed from local records.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon="refresh" onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button variant="secondary" icon="download" onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </div>
      </header>

      {workspace && !workspace.logsAvailable ? (
        <Notice
          tone="warn"
          title="Event log unavailable"
          action={
            <Button variant="secondary" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          The RPC did not return contract logs. Schedule balances on the overview remain
          authoritative; this feed only shows what the node indexed.
        </Notice>
      ) : null}

      {error ? (
        <Notice tone="error" title="Could not refresh activity">
          {error}
        </Notice>
      ) : null}

      <div className="stat-grid">
        <div className="stat-tile">
          <span className="stat-label">Total events</span>
          <span className="stat-value">{events.length}</span>
          <span className="stat-hint">From deployment block {CONFIG.deployBlock}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Claims</span>
          <span className="stat-value">{symbols.get("claimed") ?? 0}</span>
          <span className="stat-hint">Distributions to beneficiaries</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Creation batches</span>
          <span className="stat-value">{symbols.get("created") ?? 0}</span>
          <span className="stat-hint">Each may contain several schedules</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Last sync</span>
          <span className="stat-value" style={{ fontSize: 16 }}>
            {lastSyncedAt ? lastSyncedAt.toLocaleTimeString("en-GB", { hour12: false }) : "—"}
          </span>
          <span className="stat-hint">Chain time {workspace ? formatDateTime(workspace.chainNow) : "—"}</span>
        </div>
      </div>

      <Panel>
        <div style={{ padding: "0 12px" }}>
          <Tabs
            items={[
              { value: "all", label: "All events", count: events.length },
              { value: "created", label: "Created", count: symbols.get("created") ?? 0 },
              { value: "claimed", label: "Claims", count: symbols.get("claimed") ?? 0 },
              { value: "transferred", label: "Transfers", count: symbols.get("transferred") ?? 0 },
            ]}
            value={kind}
            onChange={(value) => {
              setKind(value);
              setPage(1);
            }}
            ariaLabel="Activity type"
          />
        </div>

        <div className="table-toolbar">
          <div className="search-field">
            <Icon name="search" size={15} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search address, schedule, token or tx hash"
              aria-label="Search activity"
            />
          </div>
          <span className="figure-hint">
            Source: VestingManager logs · block {workspace?.blockNumber ?? "—"}
          </span>
        </div>

        {loading && !workspace ? (
          <div className="panel-body">
            <EmptyState icon="activity" title="Loading activity" description="Querying contract logs." />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon="activity"
            title="No on-chain activity yet"
            description={
              workspace?.logsAvailable
                ? "The contract has not emitted any creation, claim or transfer events since deployment."
                : "The event feed could not be loaded from the RPC. Retry above, or inspect the contract directly on BOTScan."
            }
            action={
              <a href={EXPLORER.address("0x6867b3EfC1a393fB165285d33daAAe6539FF682b")} target="_blank" rel="noreferrer">
                <Button variant="secondary" icon="external">
                  Open BOTScan
                </Button>
              </a>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Schedule</th>
                    <th scope="col">Token</th>
                    <th scope="col" className="is-numeric">Amount</th>
                    <th scope="col">Wallet</th>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Block</th>
                    <th scope="col">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((event) => {
                    const meta = kindMeta[event.kind];
                    return (
                      <tr key={event.key}>
                        <td>
                          <span className={`event-icon ${event.kind}`} style={{ display: "inline-grid", marginRight: 8 }}>
                            <Icon name={meta.icon} size={13} />
                          </span>
                          <span style={{ fontWeight: 550, color: "var(--ink)" }}>{meta.label}</span>
                        </td>
                        <td>
                          {event.scheduleId !== undefined ? (
                            <Link className="inline-link" to={`/app/schedules/${event.scheduleId}`}>
                              #{event.scheduleId.toString()}
                            </Link>
                          ) : event.firstScheduleId !== undefined ? (
                            <span className="mono-sm">
                              #{event.firstScheduleId.toString()}–
                              {(event.firstScheduleId + (event.scheduleCount ?? 1n) - 1n).toString()}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <span className="badge badge-neutral">{event.token.symbol}</span>
                        </td>
                        <td className="is-numeric">
                          {event.amount !== undefined
                            ? formatAmount(event.amount, event.token.decimals)
                            : "—"}
                        </td>
                        <td>
                          {event.beneficiary ? (
                            <CopyAddress address={event.beneficiary} chars={4} />
                          ) : event.newBeneficiary ? (
                            <span className="stack" style={{ gap: 1 }}>
                              <CopyAddress address={event.newBeneficiary} chars={4} />
                              <span className="cell-sub">
                                from {shortAddress(event.previousBeneficiary ?? "")}
                              </span>
                            </span>
                          ) : event.funder ? (
                            <CopyAddress address={event.funder} chars={4} label="Funder" />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="cell-date">{formatDateTime(event.timestamp)}</td>
                        <td className="mono-sm">{event.blockNumber}</td>
                        <td>
                          <a
                            className="inline-link mono-sm"
                            href={EXPLORER.tx(event.txHash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {event.txHash.slice(0, 8)}… <Icon name="external" size={11} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visible.length === 0 ? (
                <p className="table-empty">No events match this filter.</p>
              ) : null}
            </div>
            <Pagination
              page={current}
              pageCount={pageCount}
              total={filtered.length}
              pageSize={pageSize}
              onChange={setPage}
            />
          </>
        )}
      </Panel>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context/WorkspaceContext";
import { aggregateBeneficiaries, nextUnlock } from "../lib/derive";
import { downloadCsv, formatAmount, formatDateTime } from "../lib/format";
import { getLabel } from "../lib/labels";
import type { BeneficiaryRow } from "../lib/derive";
import { Icon } from "../components/Icon";
import {
  Button,
  CopyAddress,
  EmptyState,
  Modal,
  Notice,
  Pagination,
  Panel,
  PanelHead,
  StatusBadge,
} from "../components/ui";

export function Beneficiaries() {
  const { workspace, loading, error, refresh } = useWorkspace();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<BeneficiaryRow | null>(null);

  const schedules = workspace?.schedules ?? [];
  const now = workspace?.chainNow ?? 0n;
  const rows = useMemo(() => aggregateBeneficiaries(schedules, now), [schedules, now]);

  const uniqueCount = useMemo(
    () => new Set(schedules.map((schedule) => schedule.beneficiary.toLowerCase())).size,
    [schedules],
  );

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((row) => row.address.toLowerCase().includes(text));
  }, [rows, query]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const totalClaimable = rows.reduce(
    (sum, row) => {
      const existing = sum.get(row.token.symbol) ?? 0n;
      sum.set(row.token.symbol, existing + row.claimable);
      return sum;
    },
    new Map<string, bigint>(),
  );

  const exportCsv = () => {
    const data: (string | number)[][] = [
      [
        "Beneficiary",
        "Token",
        "Schedule IDs",
        "Schedules",
        "Total allocated",
        "Claimed",
        "Available to claim",
        "Remaining",
        "Next unlock (UTC)",
        "Status",
      ],
      ...filtered.map((row) => [
        row.address,
        row.token.symbol,
        row.scheduleIds.map((id) => `#${id}`).join(" "),
        row.scheduleIds.length,
        formatAmount(row.allocated, row.token.decimals, 18),
        formatAmount(row.claimed, row.token.decimals, 18),
        formatAmount(row.claimable, row.token.decimals, 18),
        formatAmount(row.remaining, row.token.decimals, 18),
        row.nextUnlockAt !== null ? formatDateTime(row.nextUnlockAt) : "",
        row.status,
      ]),
    ];
    downloadCsv("vestirail-beneficiaries.csv", data);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Workspace / Beneficiaries</p>
          <h1>Beneficiaries</h1>
          <p className="page-sub">
            Recipients across every schedule, aggregated per token. Schedules for the same wallet
            are never merged financially — each keeps its own cliff and curve.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon="download" onClick={exportCsv} disabled={filtered.length === 0}>
            Export
          </Button>
          <Link to="/app/bulk">
            <Button variant="primary" icon="bulk">
              Bulk allocations
            </Button>
          </Link>
        </div>
      </header>

      {error ? (
        <Notice
          tone="warn"
          title="Beneficiary data may be stale"
          action={
            <Button variant="secondary" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      ) : null}

      {rows.length > 0 ? (
        <div className="stat-grid">
          <div className="stat-tile">
            <span className="stat-label">Unique beneficiaries</span>
            <span className="stat-value">{uniqueCount}</span>
            <span className="stat-hint">Wallets with at least one schedule</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Beneficiary / token pairs</span>
            <span className="stat-value">{rows.length}</span>
            <span className="stat-hint">Aggregation unit in this register</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Schedules covered</span>
            <span className="stat-value">{schedules.length}</span>
            <span className="stat-hint">Immutable allocations</span>
          </div>
          <div className="stat-tile stat-emphasis">
            <span className="stat-label">Claimable across wallets</span>
            <span className="stat-values">
              {totalClaimable.size === 0 ? (
                <span className="stat-value is-empty">—</span>
              ) : (
                [...totalClaimable.entries()].map(([symbol, amount]) => {
                  const row = rows.find((entry) => entry.token.symbol === symbol);
                  return (
                    <span className="stat-value" key={symbol}>
                      {formatAmount(amount, row?.token.decimals ?? 18)}{" "}
                      <span className="stat-unit">{symbol}</span>
                    </span>
                  );
                })
              )}
            </span>
            <span className="stat-hint">Claimed by each beneficiary, not by the operator</span>
          </div>
        </div>
      ) : null}

      <Panel>
        <PanelHead
          title="Beneficiary register"
          description="Grouped by wallet and token, sorted by allocation."
          actions={
            <div className="search-field">
              <Icon name="search" size={15} />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Filter by wallet address"
                aria-label="Filter beneficiaries by address"
              />
            </div>
          }
        />

        {loading && !workspace ? (
          <div className="panel-body">
            <EmptyState icon="beneficiaries" title="Loading beneficiaries" description="Reading schedules from BOT Chain." />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="beneficiaries"
            title="No beneficiaries yet"
            description="Beneficiaries are derived from schedules. Once an allocation is created, the recipient appears here automatically — there is no separate address book to maintain."
            action={
              <Link to="/app/create">
                <Button variant="primary" icon="plus">
                  Create schedule
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Beneficiary</th>
                    <th scope="col">Token</th>
                    <th scope="col" className="is-numeric">Schedules</th>
                    <th scope="col" className="is-numeric">Total allocated</th>
                    <th scope="col" className="is-numeric">Claimed</th>
                    <th scope="col" className="is-numeric">Remaining</th>
                    <th scope="col">Next unlock</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const unlock = row.nextUnlockAt !== null ? nextUnlock(row.schedules[0], now) : null;
                    return (
                      <tr
                        key={`${row.address}-${row.token.address}`}
                        className="row-click"
                        onClick={() => setSelected(row)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") setSelected(row);
                        }}
                      >
                        <td>
                          <CopyAddress address={row.address} chars={5} />
                        </td>
                        <td>
                          <span className="badge-row">
                            <span className="badge badge-neutral">{row.token.symbol}</span>
                          </span>
                        </td>
                        <td className="is-numeric">{row.scheduleIds.length}</td>
                        <td className="is-numeric">
                          {formatAmount(row.allocated, row.token.decimals)}
                        </td>
                        <td className="is-numeric">
                          {formatAmount(row.claimed, row.token.decimals)}
                        </td>
                        <td className="is-numeric">
                          {formatAmount(row.remaining, row.token.decimals)}
                        </td>
                        <td>
                          {row.nextUnlockAt !== null ? (
                            <div className="cell-primary">
                              <strong className="cell-date">{formatDateTime(row.nextUnlockAt)}</strong>
                              <span>
                                {unlock
                                  ? `${formatAmount(unlock.amount, row.token.decimals)} ${row.token.symbol}`
                                  : "Per-schedule releases"}
                              </span>
                            </div>
                          ) : (
                            <span className="muted">Complete</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visible.length === 0 ? (
                <p className="table-empty">No beneficiaries match this address.</p>
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

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Beneficiary ${selected.address.slice(0, 10)}…` : "Beneficiary"}
        width={640}
      >
        {selected ? (
          <div className="stack-16">
            <dl className="data-list">
              <div className="data-row">
                <dt>Wallet</dt>
                <dd>
                  <CopyAddress address={selected.address} chars={6} />
                </dd>
              </div>
              <div className="data-row">
                <dt>Token</dt>
                <dd>
                  {selected.token.name} ({selected.token.symbol})
                </dd>
              </div>
              <div className="data-row">
                <dt>Total allocated</dt>
                <dd>
                  {formatAmount(selected.allocated, selected.token.decimals)}{" "}
                  {selected.token.symbol}
                </dd>
              </div>
              <div className="data-row">
                <dt>Claimed</dt>
                <dd>
                  {formatAmount(selected.claimed, selected.token.decimals)}{" "}
                  {selected.token.symbol}
                </dd>
              </div>
              <div className="data-row">
                <dt>Available to claim</dt>
                <dd>
                  {formatAmount(selected.claimable, selected.token.decimals)}{" "}
                  {selected.token.symbol}
                </dd>
              </div>
            </dl>

            <div>
              <p className="eyebrow" style={{ marginBottom: 8 }}>
                Schedules for this beneficiary
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Schedule</th>
                      <th scope="col">Label</th>
                      <th scope="col" className="is-numeric">Allocation</th>
                      <th scope="col">Fully vested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.schedules.map((schedule) => (
                      <tr key={schedule.id.toString()}>
                        <td>
                          <Link className="inline-link" to={`/app/schedules/${schedule.id}`}>
                            #{schedule.id.toString()}
                          </Link>
                        </td>
                        <td>{getLabel(schedule.id.toString())?.label ?? "—"}</td>
                        <td className="is-numeric">
                          {formatAmount(schedule.total, schedule.token.decimals)}
                        </td>
                        <td>{formatDateTime(schedule.endedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="breakdown-note">
              VestiRail does not verify off-chain identity. The address above is the only
              confirmed recipient of these allocations.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Schedule, ScheduleStatus } from "../lib/types";
import { formatAmount, formatDateTime, formatPercent, sameAddress } from "../lib/format";
import { nextUnlock, scheduleStatus } from "../lib/derive";
import { getLabel } from "../lib/labels";
import { Badge, CopyAddress, Pagination, Select, StatusBadge } from "./ui";
import { Icon } from "./Icon";

type SortKey = "id" | "beneficiary" | "total" | "claimed" | "remaining" | "next";

const statusFilters: { value: ScheduleStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "claimable", label: "Claimable" },
  { value: "completed", label: "Completed" },
  { value: "fully-claimed", label: "Fully claimed" },
];

export function ScheduleTable({
  schedules,
  now,
  pageSize = 10,
  compact = false,
  initialStatus = "all",
  emptyMessage = "No vesting schedules match this view.",
  highlightBeneficiary,
}: {
  schedules: Schedule[];
  now: bigint;
  pageSize?: number;
  compact?: boolean;
  initialStatus?: ScheduleStatus | "all";
  emptyMessage?: string;
  highlightBeneficiary?: string | null;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ScheduleStatus | "all">(initialStatus);
  const [token, setToken] = useState("all");
  const [sort, setSort] = useState<SortKey>(compact ? "next" : "id");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);

  const tokens = useMemo(() => {
    const map = new Map<string, string>();
    for (const schedule of schedules) {
      map.set(schedule.token.address.toLowerCase(), schedule.token.symbol);
    }
    return [...map.entries()];
  }, [schedules]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = schedules.filter((schedule) => {
      if (token !== "all" && schedule.token.address.toLowerCase() !== token) return false;
      if (status !== "all" && scheduleStatus(schedule, now) !== status) return false;
      if (!query) return true;
      const label = getLabel(schedule.id.toString())?.label?.toLowerCase() ?? "";
      return (
        schedule.id.toString().includes(query) ||
        schedule.beneficiary.toLowerCase().includes(query) ||
        schedule.token.symbol.toLowerCase().includes(query) ||
        label.includes(query)
      );
    });

    const value = (schedule: Schedule): bigint | number | string => {
      switch (sort) {
        case "beneficiary":
          return schedule.beneficiary.toLowerCase();
        case "total":
          return schedule.total;
        case "claimed":
          return schedule.claimed;
        case "remaining":
          return schedule.total - schedule.claimed;
        case "next":
          return nextUnlock(schedule, now)?.at ?? 0n;
        default:
          return schedule.id;
      }
    };

    return rows.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const result =
        typeof left === "bigint" && typeof right === "bigint"
          ? left < right
            ? -1
            : left > right
              ? 1
              : 0
          : String(left).localeCompare(String(right));
      return direction === "asc" ? result : -result;
    });
  }, [schedules, search, status, token, sort, direction, now]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * size, current * size);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDirection(direction === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDirection(key === "beneficiary" ? "asc" : "desc");
    }
  };

  const header = (label: string, key: SortKey, numeric = false) => (
    <th className={numeric ? "is-numeric" : ""} scope="col">
      <button type="button" onClick={() => toggleSort(key)}>
        {label}
        {sort === key ? (
          <Icon name="chevronDown" size={12} style={{ transform: direction === "asc" ? "rotate(180deg)" : undefined }} />
        ) : null}
      </button>
    </th>
  );

  return (
    <div className="schedule-table">
      {!compact ? (
        <div className="table-toolbar">
          <div className="search-field">
            <Icon name="search" size={15} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search beneficiary, schedule ID or label"
              aria-label="Search schedules"
            />
          </div>
          <div className="toolbar-filters">
            <Select
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setPage(1);
              }}
              aria-label="Filter by token"
            >
              <option value="all">All tokens</option>
              {tokens.map(([address, symbol]) => (
                <option key={address} value={address}>
                  {symbol}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ScheduleStatus | "all");
                setPage(1);
              }}
              aria-label="Filter by status"
            >
              {statusFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {header("Schedule", "id")}
              {header("Beneficiary", "beneficiary")}
              <th scope="col">Token</th>
              {header("Allocation", "total", true)}
              {header("Released", "claimed", true)}
              {header("Remaining", "remaining", true)}
              {header("Next unlock", "next")}
              <th scope="col">Status</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map((schedule) => {
              const unlock = nextUnlock(schedule, now);
              const label = getLabel(schedule.id.toString());
              const isYou = sameAddress(schedule.beneficiary, highlightBeneficiary);
              return (
                <tr
                  key={schedule.id.toString()}
                  className="row-click"
                  onClick={() => navigate(`/app/schedules/${schedule.id}`)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") navigate(`/app/schedules/${schedule.id}`);
                  }}
                >
                  <td className="is-strong">
                    <div className="cell-primary">
                      <strong>#{schedule.id.toString()}</strong>
                      <span>{label?.label ?? "No local label"}</span>
                    </div>
                  </td>
                  <td>
                    <div className="cell-primary">
                      <CopyAddress address={schedule.beneficiary} chars={4} />
                      <span>{isYou ? "Connected wallet" : "Beneficiary"}</span>
                    </div>
                  </td>
                  <td>
                    <Badge tone="neutral">{schedule.token.symbol}</Badge>
                  </td>
                  <td className="is-numeric">
                    {formatAmount(schedule.total, schedule.token.decimals)}
                  </td>
                  <td className="is-numeric">
                    {formatAmount(schedule.claimed, schedule.token.decimals)}
                    <span className="cell-sub">
                      {formatPercent(schedule.claimed, schedule.total)}
                    </span>
                  </td>
                  <td className="is-numeric">
                    {formatAmount(
                      schedule.total > schedule.claimed ? schedule.total - schedule.claimed : 0n,
                      schedule.token.decimals,
                    )}
                  </td>
                  <td>
                    {unlock ? (
                      <div className="cell-primary">
                        <strong className="cell-date">{formatDateTime(unlock.at)}</strong>
                        <span>
                          {formatAmount(unlock.amount, schedule.token.decimals)}{" "}
                          {schedule.token.symbol}
                        </span>
                      </div>
                    ) : (
                      <span className="muted">Complete</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={scheduleStatus(schedule, now)} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`View schedule ${schedule.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/app/schedules/${schedule.id}`);
                      }}
                    >
                      <Icon name="arrowRight" size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 ? <p className="table-empty">{emptyMessage}</p> : null}
      </div>

      {!compact ? (
        <Pagination
          page={current}
          pageCount={pageCount}
          total={filtered.length}
          pageSize={size}
          onChange={setPage}
          onPageSize={(next) => {
            setSize(next);
            setPage(1);
          }}
        />
      ) : null}

      {compact && filtered.length > 0 ? (
        <p className="table-compact-note">
          Showing {Math.min(visible.length, filtered.length)} of {filtered.length} schedules ·{" "}
          <a href="/app/schedules">View all</a>
        </p>
      ) : null}
    </div>
  );
}

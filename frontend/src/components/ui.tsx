import { useEffect, useId, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { Icon, type IconName } from "./Icon";
import type { ScheduleStatus } from "../lib/types";

/* ------------------------------------------------------------------ button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {!loading && icon ? <Icon name={icon} size={size === "sm" ? 15 : 16} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={15} /> : null}
    </button>
  );
}

/* ------------------------------------------------------------------- badge */

type BadgeTone = "neutral" | "brand" | "warn" | "danger" | "info" | "ink";

export function Badge({
  tone = "neutral",
  children,
  dot,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot ? <i className="badge-dot" /> : null}
      {children}
    </span>
  );
}

const statusMap: Record<ScheduleStatus, { label: string; tone: BadgeTone }> = {
  upcoming: { label: "Upcoming", tone: "neutral" },
  active: { label: "Active", tone: "info" },
  claimable: { label: "Claimable", tone: "brand" },
  "fully-claimed": { label: "Fully claimed", tone: "ink" },
  completed: { label: "Completed", tone: "neutral" },
};

export function StatusBadge({ status }: { status: ScheduleStatus }) {
  const config = statusMap[status];
  return (
    <Badge tone={config.tone} dot>
      {config.label}
    </Badge>
  );
}

/* ------------------------------------------------------------------- panel */

export function Panel({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return <Tag className={`panel ${className}`.trim()}>{children}</Tag>;
}

export function PanelHead({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="panel-head">
      <div className="panel-heading">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="panel-title">{title}</h2>
        {description ? <p className="panel-sub">{description}</p> : null}
      </div>
      {actions ? <div className="panel-actions">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  optional,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  optional?: boolean;
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  return (
    <div className={`field ${error ? "field-error" : ""}`.trim()}>
      <div className="field-top">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {optional ? <span className="field-optional">Optional</span> : null}
      </div>
      {children}
      {error ? (
        <p className="field-message error" role="alert" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-message" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...rest} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-wrap">
      <select className={`select ${className}`.trim()} {...rest}>
        {children}
      </select>
      <Icon name="chevronDown" size={15} />
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segment ${value === option.value ? "is-active" : ""}`.trim()}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- stats */

export function StatTile({
  label,
  values,
  hint,
  emphasis,
  icon,
}: {
  label: string;
  values: { value: string; unit: string }[];
  hint?: ReactNode;
  emphasis?: boolean;
  icon?: IconName;
}) {
  return (
    <div className={`stat-tile ${emphasis ? "stat-emphasis" : ""}`.trim()}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon ? <Icon name={icon} size={15} className="stat-icon" /> : null}
      </div>
      <div className="stat-values">
        {values.length === 0 ? (
          <span className="stat-value is-empty">—</span>
        ) : (
          values.map((entry) => (
            <span className="stat-value" key={entry.unit}>
              {entry.value} <span className="stat-unit">{entry.unit}</span>
            </span>
          ))
        )}
      </div>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ states */

export function EmptyState({
  icon = "schedules",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "", height = 16 }: { className?: string; height?: number }) {
  return <span className={`skeleton ${className}`.trim()} style={{ height }} aria-hidden="true" />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-label={label}>
      <span />
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "error" | "success";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon
        name={tone === "error" || tone === "warn" ? "alert" : tone === "success" ? "check" : "shield"}
        size={17}
      />
      <div className="notice-body">
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {action ? <div className="notice-action">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- modal */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        style={{ maxWidth: width }}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- tooltip */

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="tip" data-tip={text} tabIndex={0}>
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- copy addr */

export function CopyAddress({
  address,
  chars = 4,
  full,
  label,
}: {
  address: string;
  chars?: number;
  full?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const text = full ? address : `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;

  return (
    <span className="address-chip">
      {label ? <span className="address-label">{label}</span> : null}
      <span className="mono address-text" title={address}>
        {text}
      </span>
      <button
        type="button"
        className="copy-btn"
        onClick={copy}
        aria-label={copied ? "Address copied" : `Copy address ${address}`}
        title={copied ? "Copied" : "Copy address"}
      >
        <Icon name={copied ? "check" : "copy"} size={13} />
      </button>
    </span>
  );
}

/* -------------------------------------------------------------------- tabs */

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          className={`tab ${value === item.value ? "is-active" : ""}`.trim()}
          onClick={() => onChange(item.value)}
          type="button"
        >
          {item.label}
          {typeof item.count === "number" ? <span className="tab-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- pagination */

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span className="pagination-info">
        {from}–{to} of {total}
      </span>
      <div className="pagination-controls">
        {onPageSize ? (
          <select
            className="select select-sm"
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            aria-label="Rows per page"
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- misc util */

export function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="data-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

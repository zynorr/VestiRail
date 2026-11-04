const numberFormat = new Intl.NumberFormat("en-US");

/** Truncates (never rounds up) to `maxFrac` decimals, then trims zeros. */
export function formatAmount(value: bigint, decimals: number, maxFrac = 4): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;

  let frac = fraction.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  const grouped = numberFormat.format(whole);
  const text = frac ? `${grouped}.${frac}` : grouped;
  return negative ? `-${text}` : text;
}

export function formatPercent(part: bigint, whole: bigint, digits = 1): string {
  if (whole === 0n) return "0%";
  const scale = 10n ** BigInt(digits);
  const value = (part * 100n * scale) / whole;
  const numeric = Number(value) / Number(scale);
  return `${numeric.toFixed(digits)}%`;
}

export function shortAddress(address: string, chars = 4): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  hour12: false,
});

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDateTime(timestamp: bigint | number): string {
  return `${dateTimeFormat.format(new Date(Number(timestamp) * 1000))} UTC`;
}

export function formatDate(timestamp: bigint | number): string {
  return dateFormat.format(new Date(Number(timestamp) * 1000));
}

/** Value for a datetime-local input, expressed in UTC so it matches on-chain time. */
export function toDateTimeLocal(timestamp: bigint | number): string {
  const date = new Date(Number(timestamp) * 1000);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Parses a datetime-local value as UTC seconds. Returns null for invalid input. */
export function parseDateTimeLocal(value: string): bigint | null {
  if (!value) return null;
  const millis = Date.parse(`${value}:00Z`.replace(/:00:00Z$/, ":00Z"));
  if (Number.isNaN(millis)) return null;
  return BigInt(Math.floor(millis / 1000));
}

export function addDays(timestamp: bigint, days: number): bigint {
  return timestamp + BigInt(Math.round(days * 86_400));
}

export function daysBetween(from: bigint, to: bigint): number {
  return Number(to - from) / 86_400;
}

export function relativeTime(timestamp: bigint, now: bigint): string {
  const diff = timestamp - now;
  const abs = diff < 0n ? -diff : diff;
  const minutes = Number(abs) / 60;
  const hours = minutes / 60;
  const days = hours / 24;

  let text: string;
  if (minutes < 60) text = `${Math.max(1, Math.round(minutes))} min`;
  else if (hours < 48) text = `${Math.round(hours)} hr`;
  else if (days < 60) text = `${Math.round(days)} days`;
  else text = `${Math.round(days / 30)} months`;

  return diff >= 0n ? `in ${text}` : `${text} ago`;
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const escape = (cell: string | number) => {
    const text = String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function decodeError(error: unknown): string {
  const candidate = error as {
    shortMessage?: string;
    reason?: string;
    message?: string;
    data?: string;
    info?: { error?: { data?: string; message?: string } };
  };
  if (candidate?.shortMessage) return candidate.shortMessage;
  if (candidate?.reason) return candidate.reason;
  if (candidate?.info?.error?.message) return candidate.info.error.message;
  if (candidate?.message) return candidate.message.split("\n")[0];
  return "Transaction failed.";
}

export type LabelEntry = { label: string; reference: string };

const STORAGE_KEY = "vestirail.scheduleLabels.v1";

function readAll(): Record<string, LabelEntry> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LabelEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getLabel(scheduleId: string): LabelEntry | undefined {
  return readAll()[scheduleId];
}

export function getAllLabels(): Record<string, LabelEntry> {
  return readAll();
}

export function saveLabel(scheduleId: string, entry: LabelEntry): void {
  const all = readAll();
  all[scheduleId] = entry;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function clearLabels(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

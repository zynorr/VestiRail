import { vestedAmount } from "../../../shared/vesting";
import type { Schedule, ScheduleStatus } from "./types";

export function scheduleStatus(schedule: Schedule, now: bigint): ScheduleStatus {
  if (schedule.claimed >= schedule.total && schedule.total > 0n) return "fully-claimed";
  if (now >= schedule.endedAt) return "completed";
  if (schedule.claimable > 0n) return "claimable";
  if (now >= schedule.start) return "active";
  return "upcoming";
}

export type NextUnlock = {
  at: bigint;
  amount: bigint;
  kind: "cliff" | "stream" | "available";
};

const DAY = 86_400n;

export function nextUnlock(schedule: Schedule, now: bigint): NextUnlock | null {
  if (schedule.claimed >= schedule.total) return null;

  const terms = {
    totalAmount: schedule.total,
    start: schedule.start,
    cliffDuration: schedule.cliffDuration,
    duration: schedule.duration,
  };

  if (now < schedule.cliffAt) {
    const atCliff = vestedAmount(terms, schedule.cliffAt);
    const delta = atCliff > schedule.claimed ? atCliff - schedule.claimed : 0n;
    if (delta > 0n) return { at: schedule.cliffAt, amount: delta, kind: "cliff" };
  }

  if (now < schedule.endedAt) {
    const base = now < schedule.start ? schedule.start : now;
    const next = base + DAY;
    const horizon = next > schedule.endedAt ? schedule.endedAt : next;
    const vestedBase = vestedAmount(terms, base);
    const vestedThen = vestedAmount(terms, horizon);
    const alreadyAvailable = vestedBase > schedule.claimed ? vestedBase : schedule.claimed;
    const amount = vestedThen > alreadyAvailable ? vestedThen - alreadyAvailable : 0n;
    return { at: horizon, amount, kind: "stream" };
  }

  return {
    at: now,
    amount: schedule.total > schedule.claimed ? schedule.total - schedule.claimed : 0n,
    kind: "available",
  };
}

export type TokenTotals = {
  token: Schedule["token"];
  allocated: bigint;
  vested: bigint;
  claimed: bigint;
  claimable: bigint;
  locked: bigint;
};

export function totalsByToken(schedules: Schedule[]): TokenTotals[] {
  const map = new Map<string, TokenTotals>();
  for (const schedule of schedules) {
    const key = schedule.token.address.toLowerCase();
    const current =
      map.get(key) ??
      {
        token: schedule.token,
        allocated: 0n,
        vested: 0n,
        claimed: 0n,
        claimable: 0n,
        locked: 0n,
      };
    current.allocated += schedule.total;
    current.vested += schedule.vested;
    current.claimed += schedule.claimed;
    current.claimable += schedule.claimable;
    current.locked += schedule.total > schedule.vested ? schedule.total - schedule.vested : 0n;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.token.symbol.localeCompare(b.token.symbol));
}

export type BeneficiaryRow = {
  address: string;
  token: Schedule["token"];
  scheduleIds: bigint[];
  allocated: bigint;
  claimed: bigint;
  claimable: bigint;
  remaining: bigint;
  nextUnlockAt: bigint | null;
  status: ScheduleStatus;
  schedules: Schedule[];
};

export function aggregateBeneficiaries(
  schedules: Schedule[],
  now: bigint,
): BeneficiaryRow[] {
  const map = new Map<string, BeneficiaryRow>();

  for (const schedule of schedules) {
    const key = `${schedule.beneficiary.toLowerCase()}:${schedule.token.address.toLowerCase()}`;
    const current =
      map.get(key) ??
      {
        address: schedule.beneficiary,
        token: schedule.token,
        scheduleIds: [],
        allocated: 0n,
        claimed: 0n,
        claimable: 0n,
        remaining: 0n,
        nextUnlockAt: null,
        status: "upcoming" as ScheduleStatus,
        schedules: [],
      };
    current.scheduleIds.push(schedule.id);
    current.allocated += schedule.total;
    current.claimed += schedule.claimed;
    current.claimable += schedule.claimable;
    current.remaining += schedule.total - schedule.claimed;
    current.schedules.push(schedule);

    const unlock = nextUnlock(schedule, now);
    if (unlock && (current.nextUnlockAt === null || unlock.at < current.nextUnlockAt)) {
      current.nextUnlockAt = unlock.at;
    }
    const status = scheduleStatus(schedule, now);
    const priority: Record<ScheduleStatus, number> = {
      claimable: 5,
      completed: 4,
      active: 3,
      upcoming: 2,
      "fully-claimed": 1,
    };
    if (priority[status] > priority[current.status]) current.status = status;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => {
    const diff = b.allocated - a.allocated;
    return diff === 0n ? 0 : diff > 0n ? 1 : -1;
  });
}

export function uniqueTokens(schedules: Schedule[]) {
  const map = new Map<string, Schedule["token"]>();
  for (const schedule of schedules) {
    map.set(schedule.token.address.toLowerCase(), schedule.token);
  }
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

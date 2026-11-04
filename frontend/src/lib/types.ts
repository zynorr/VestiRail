export type TokenMeta = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  native: boolean;
  supported: boolean;
};

export type Schedule = {
  id: bigint;
  beneficiary: string;
  token: TokenMeta;
  start: bigint;
  cliffDuration: bigint;
  duration: bigint;
  total: bigint;
  claimed: bigint;
  vested: bigint;
  claimable: bigint;
  endedAt: bigint;
  cliffAt: bigint;
};

export type ChainEventKind = "created" | "claimed" | "transferred";

export type ChainEvent = {
  key: string;
  kind: ChainEventKind;
  token: TokenMeta;
  blockNumber: number;
  txHash: string;
  timestamp: bigint;
  funder?: string;
  firstScheduleId?: bigint;
  scheduleCount?: bigint;
  scheduleId?: bigint;
  beneficiary?: string;
  previousBeneficiary?: string;
  newBeneficiary?: string;
  amount?: bigint;
};

export type Workspace = {
  schedules: Schedule[];
  tokens: TokenMeta[];
  events: ChainEvent[];
  chainNow: bigint;
  blockNumber: number;
  logsAvailable: boolean;
};

export type ScheduleStatus =
  | "upcoming"
  | "active"
  | "claimable"
  | "fully-claimed"
  | "completed";

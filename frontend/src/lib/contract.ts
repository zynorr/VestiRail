import { Contract, JsonRpcProvider, ZeroAddress } from "ethers";
import type { EventLog } from "ethers";
import { vestingManagerAbi } from "../abi";
import { vestedAmount } from "../../../shared/vesting";
import { CONFIG, NATIVE } from "./config";
import type { ChainEvent, Schedule, TokenMeta, Workspace } from "./types";

export const readProvider = new JsonRpcProvider(
  `${window.location.origin}/rpc`,
  CONFIG.chainId,
  { staticNetwork: true, batchMaxCount: 12 },
);

export const manager = new Contract(CONFIG.manager, vestingManagerAbi, readProvider);

const tokenCache = new Map<string, TokenMeta>();

export function nativeToken(): TokenMeta {
  return {
    address: NATIVE,
    symbol: "BOT",
    name: "BOT (native)",
    decimals: 18,
    native: true,
    supported: true,
  };
}

export async function resolveToken(address: string): Promise<TokenMeta> {
  if (address === ZeroAddress || address.toLowerCase() === NATIVE) return nativeToken();

  const key = address.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached) return cached;

  const fallback: TokenMeta = {
    address,
    symbol: "TOKEN",
    name: "Unsupported token",
    decimals: 18,
    native: false,
    supported: false,
  };

  try {
    const contract = new Contract(
      address,
      [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ],
      readProvider,
    );
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);
    const meta: TokenMeta = {
      address,
      name: String(name),
      symbol: String(symbol),
      decimals: Number(decimals),
      native: false,
      supported: true,
    };
    tokenCache.set(key, meta);
    return meta;
  } catch {
    tokenCache.set(key, fallback);
    return fallback;
  }
}

function tokenLookup(tokens: TokenMeta[], address: string): TokenMeta {
  return (
    tokens.find((token) => token.address.toLowerCase() === address.toLowerCase()) ??
    (address === ZeroAddress ? nativeToken() : {
      address,
      symbol: "TOKEN",
      name: "Unsupported token",
      decimals: 18,
      native: false,
      supported: false,
    })
  );
}

type RawLog = EventLog;

async function loadEvents(
  tokens: TokenMeta[],
  fromBlock: number,
  toBlock: number,
): Promise<{ events: ChainEvent[]; available: boolean }> {
  try {
    const filters = [
      manager.filters.SchedulesCreated(),
      manager.filters.Claimed(),
      manager.filters.BeneficiaryTransferred(),
    ];
    const [created, claimed, transferred] = await Promise.all(
      filters.map((filter) => manager.queryFilter(filter, fromBlock, toBlock)),
    );

    const logs = [...created, ...claimed, ...transferred] as RawLog[];
    const blockNumbers = [...new Set(logs.map((log) => log.blockNumber))];
    const blocks = await Promise.all(
      blockNumbers.map((number) => readProvider.getBlock(number)),
    );
    const timestamps = new Map<number, bigint>();
    blocks.forEach((block, index) => {
      if (block) timestamps.set(blockNumbers[index], BigInt(block.timestamp));
    });

    const events: ChainEvent[] = logs.map((log) => {
      const base = {
        key: `${log.transactionHash}-${log.index}`,
        token:
          log.args?.token !== undefined
            ? tokenLookup(tokens, String(log.args.token))
            : nativeToken(),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
        timestamp: timestamps.get(log.blockNumber) ?? 0n,
      };

      if (log.fragment?.name === "SchedulesCreated") {
        return {
          ...base,
          kind: "created" as const,
          funder: String(log.args.funder),
          firstScheduleId: BigInt(log.args.firstScheduleId),
          scheduleCount: BigInt(log.args.scheduleCount),
          amount: BigInt(log.args.totalAmount),
        };
      }
      if (log.fragment?.name === "Claimed") {
        return {
          ...base,
          kind: "claimed" as const,
          scheduleId: BigInt(log.args.scheduleId),
          beneficiary: String(log.args.beneficiary),
          amount: BigInt(log.args.amount),
        };
      }
      return {
        ...base,
        kind: "transferred" as const,
        scheduleId: BigInt(log.args.scheduleId),
        previousBeneficiary: String(log.args.previousBeneficiary),
        newBeneficiary: String(log.args.newBeneficiary),
      };
    });

    events.sort((a, b) =>
      a.blockNumber === b.blockNumber
        ? a.key.localeCompare(b.key)
        : b.blockNumber - a.blockNumber,
    );

    return { events, available: true };
  } catch {
    // Contract state is still trustworthy; only the event feed is unavailable.
    return { events: [], available: false };
  }
}

export async function fetchWorkspace(): Promise<Workspace> {
  const [nextIdRaw, latestBlock] = await Promise.all([
    manager.nextScheduleId() as Promise<bigint>,
    readProvider.getBlock("latest"),
  ]);
  const chainNow = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000));
  const count = Number(nextIdRaw) - 1;

  const rawSchedules = await Promise.all(
    Array.from({ length: Math.max(count, 0) }, (_, index) =>
      manager.getSchedule(BigInt(index + 1)),
    ),
  );

  const addresses = [...new Set(rawSchedules.map((raw) => String(raw.token)))];
  const tokens = await Promise.all(addresses.map((address) => resolveToken(address)));
  tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const schedules: Schedule[] = rawSchedules.map((raw, index) => {
    const token = tokenLookup(tokens, String(raw.token));
    const start = BigInt(raw.start);
    const cliffDuration = BigInt(raw.cliffDuration);
    const duration = BigInt(raw.duration);
    const total = BigInt(raw.totalAmount);
    const claimed = BigInt(raw.claimedAmount);
    const vested = vestedAmount(
      { totalAmount: total, start, cliffDuration, duration },
      chainNow,
    );

    return {
      id: BigInt(index + 1),
      beneficiary: String(raw.beneficiary),
      token,
      start,
      cliffDuration,
      duration,
      total,
      claimed,
      vested,
      claimable: vested > claimed ? vested - claimed : 0n,
      cliffAt: start + cliffDuration,
      endedAt: start + duration,
    };
  });

  const { events, available } = await loadEvents(
    tokens,
    CONFIG.deployBlock,
    latestBlock?.number ?? CONFIG.deployBlock,
  );

  return {
    schedules,
    tokens,
    events,
    chainNow,
    blockNumber: latestBlock?.number ?? 0,
    logsAvailable: available,
  };
}

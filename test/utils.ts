import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

export const ZERO = ethers.ZeroAddress as string;
export const HOUR = 3_600n;
export const DAY = 86_400n;
export const YEAR = 365n * DAY;

export type ScheduleInput = {
  beneficiary: string;
  start: bigint;
  cliffDuration: bigint;
  duration: bigint;
  totalAmount: bigint;
};

export function scheduleInput(
  overrides: Partial<ScheduleInput> & { beneficiary: string },
): ScheduleInput {
  return {
    start: 0n,
    cliffDuration: 0n,
    duration: DAY,
    totalAmount: ethers.parseEther("1"),
    ...overrides,
  };
}

export function sumAmounts(inputs: ScheduleInput[]): bigint {
  return inputs.reduce((total, input) => total + input.totalAmount, 0n);
}

export async function deployManager() {
  const manager = await ethers.deployContract("VestingManager");
  await manager.waitForDeployment();
  return manager;
}

export async function deployMockToken(name = "Mock Token", symbol = "MOCK") {
  const token = await ethers.deployContract("MockERC20", [name, symbol]);
  await token.waitForDeployment();
  return token;
}

export async function currentTimestamp(): Promise<bigint> {
  return BigInt(await time.latest());
}

/** Mine the next block at exactly `timestamp` (used before claim txs). */
export async function setNextBlockTimestamp(timestamp: bigint | number): Promise<void> {
  await time.setNextBlockTimestamp(Number(timestamp));
}

/** Unix timestamp of a transaction receipt's block. */
export async function blockTimestampOf(receipt: { blockNumber: number }): Promise<bigint> {
  const block = await ethers.provider.getBlock(receipt.blockNumber);
  if (!block) throw new Error(`missing block ${receipt.blockNumber}`);
  return BigInt(block.timestamp);
}

/** Decode the single `Claimed` event from a claim receipt. */
export function decodeClaimed(manager: any, receipt: any) {
  for (const log of receipt.logs) {
    try {
      const parsed = manager.interface.parseLog(log);
      if (parsed?.name === "Claimed") {
        return {
          scheduleId: parsed.args[0] as bigint,
          beneficiary: parsed.args[1] as string,
          token: parsed.args[2] as string,
          amount: parsed.args[3] as bigint,
        };
      }
    } catch {
      // Not a VestingManager log.
    }
  }
  throw new Error("Claimed event not found");
}

/**
 * Claim at an exact timestamp and return the mined block timestamp plus the
 * decoded payout. `setNextBlockTimestamp` guarantees the claim is mined at
 * exactly `timestamp`, so boundary assertions are deterministic.
 */
export async function claimAt(
  manager: any,
  signer: any,
  scheduleId: bigint,
  timestamp: bigint,
) {
  await setNextBlockTimestamp(timestamp);
  const tx = await manager.connect(signer).claim(scheduleId);
  const receipt = await tx.wait();
  const blockTimestamp = await blockTimestampOf(receipt);
  const event = decodeClaimed(manager, receipt);
  return { tx, receipt, blockTimestamp, event };
}

/** Claim at the next block's natural timestamp. */
export async function claimNow(manager: any, signer: any, scheduleId: bigint) {
  const tx = await manager.connect(signer).claim(scheduleId);
  const receipt = await tx.wait();
  const blockTimestamp = await blockTimestampOf(receipt);
  const event = decodeClaimed(manager, receipt);
  return { tx, receipt, blockTimestamp, event };
}

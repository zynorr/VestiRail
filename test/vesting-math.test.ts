import { expect } from "chai";
import { ethers } from "hardhat";
import {
  claimAt,
  currentTimestamp,
  deployManager,
  scheduleInput,
  setNextBlockTimestamp,
  ZERO,
} from "./utils";

const TOTAL = ethers.parseEther("1000");
const CLIFF = 1_000n;
const DURATION = 4_000n;

describe("VestingMath: cliff and linear vesting mathematics", () => {
  let manager: any;
  let alice: any;
  let start: bigint;
  let end: bigint;

  beforeEach(async () => {
    [, alice] = await ethers.getSigners();
    manager = await deployManager();
    start = (await currentTimestamp()) + 2_000n;
    end = start + DURATION;

    await manager.createNativeSchedules(
      [
        scheduleInput({
          beneficiary: alice.address,
          start,
          cliffDuration: CLIFF,
          duration: DURATION,
          totalAmount: TOTAL,
        }),
      ],
      { value: TOTAL },
    );
  });

  const linear = (timestamp: bigint) => (TOTAL * (timestamp - start)) / DURATION;

  it("vests nothing before start", async () => {
    expect(await manager.vestedAmount(1n, 0n)).to.equal(0n);
    expect(await manager.vestedAmount(1n, start - 1n)).to.equal(0n);
  });

  it("vests nothing at start and one second before the cliff", async () => {
    expect(await manager.vestedAmount(1n, start)).to.equal(0n);
    expect(await manager.vestedAmount(1n, start + CLIFF - 1n)).to.equal(0n);
  });

  it("exactly at the cliff vests the slice accrued from start (cliff does not reset accrual)", async () => {
    const vested = await manager.vestedAmount(1n, start + CLIFF);
    expect(vested).to.equal((TOTAL * CLIFF) / DURATION);
    expect(vested).to.equal(ethers.parseEther("250"));
    expect(vested).to.equal(linear(start + CLIFF));
  });

  it("is linear between the cliff and the end", async () => {
    const points = [start + CLIFF + 1n, start + 2_000n, start + 3_000n, end - 1n];
    for (const timestamp of points) {
      expect(await manager.vestedAmount(1n, timestamp)).to.equal(linear(timestamp));
    }
    expect(await manager.vestedAmount(1n, start + 2_000n)).to.equal(
      ethers.parseEther("500"),
    );
    expect(await manager.vestedAmount(1n, start + 3_000n)).to.equal(
      ethers.parseEther("750"),
    );
  });

  it("floors fractional wei instead of rounding up", async () => {
    // 1000 wei over 3 seconds => 333.33 wei per second.
    await manager.createNativeSchedules(
      [
        scheduleInput({
          beneficiary: alice.address,
          start,
          duration: 3n,
          totalAmount: 1_000n,
        }),
      ],
      { value: 1_000n },
    );

    expect(await manager.vestedAmount(2n, start)).to.equal(0n);
    expect(await manager.vestedAmount(2n, start + 1n)).to.equal(333n);
    expect(await manager.vestedAmount(2n, start + 2n)).to.equal(666n);
    expect(await manager.vestedAmount(2n, start + 3n)).to.equal(1_000n);
  });

  it("is fully vested at exactly the end and stays fully vested after it", async () => {
    expect(await manager.vestedAmount(1n, end - 1n)).to.equal(
      (TOTAL * (DURATION - 1n)) / DURATION,
    );
    expect(await manager.vestedAmount(1n, end)).to.equal(TOTAL);
    expect(await manager.vestedAmount(1n, end + 1n)).to.equal(TOTAL);
    expect(await manager.vestedAmount(1n, end + 100n * DURATION)).to.equal(TOTAL);
  });

  it("never decreases anywhere across the schedule", async () => {
    let previous = 0n;
    for (let timestamp = start - 5n; timestamp <= end + 5n; timestamp += 37n) {
      const vested = await manager.vestedAmount(1n, timestamp);
      expect(vested).to.be.greaterThanOrEqual(previous);
      previous = vested;
    }
    // The loop may stop just short of the end; the end boundary is checked here.
    expect(previous).to.be.lessThanOrEqual(TOTAL);
    expect(await manager.vestedAmount(1n, end)).to.equal(TOTAL);
    expect(await manager.vestedAmount(1n, end + 10n)).to.equal(TOTAL);
  });

  it("treats a zero cliff as claimable linearly from start", async () => {
    await manager.createNativeSchedules(
      [
        scheduleInput({
          beneficiary: alice.address,
          start,
          cliffDuration: 0n,
          duration: DURATION,
          totalAmount: TOTAL,
        }),
      ],
      { value: TOTAL },
    );

    expect(await manager.vestedAmount(2n, start - 1n)).to.equal(0n);
    expect(await manager.vestedAmount(2n, start)).to.equal(0n);
    expect(await manager.vestedAmount(2n, start + 1n)).to.equal(TOTAL / DURATION);
    expect(await manager.vestedAmount(2n, start + 2_000n)).to.equal(
      ethers.parseEther("500"),
    );
  });

  it("treats cliff == duration as a single unlock exactly at the end", async () => {
    await manager.createNativeSchedules(
      [
        scheduleInput({
          beneficiary: alice.address,
          start,
          cliffDuration: DURATION,
          duration: DURATION,
          totalAmount: TOTAL,
        }),
      ],
      { value: TOTAL },
    );

    expect(await manager.vestedAmount(2n, start)).to.equal(0n);
    expect(await manager.vestedAmount(2n, end - 1n)).to.equal(0n);
    expect(await manager.vestedAmount(2n, end)).to.equal(TOTAL);
  });

  it("blocks the claim one second before the cliff and pays the cliff slice at the cliff", async () => {
    await setNextBlockTimestamp(start + CLIFF - 1n);
    await expect(manager.connect(alice).claim(1n))
      .to.be.revertedWithCustomError(manager, "NothingToClaim")
      .withArgs(1n);

    const atCliff = await claimAt(manager, alice, 1n, start + CLIFF);
    expect(atCliff.blockTimestamp).to.equal(start + CLIFF);
    expect(atCliff.event.amount).to.equal((TOTAL * CLIFF) / DURATION);
  });

  it("pays the exact remainder at the end boundary, then refuses duplicate claims", async () => {
    const beforeEnd = await claimAt(manager, alice, 1n, end - 1n);
    expect(beforeEnd.event.amount).to.equal((TOTAL * (DURATION - 1n)) / DURATION);

    const atEnd = await claimAt(manager, alice, 1n, end);
    expect(atEnd.blockTimestamp).to.equal(end);
    expect(atEnd.event.amount).to.equal(TOTAL - beforeEnd.event.amount);

    await expect(manager.connect(alice).claim(1n))
      .to.be.revertedWithCustomError(manager, "NothingToClaim")
      .withArgs(1n);

    expect(await manager.totalClaimed(ZERO)).to.equal(TOTAL);
    expect(await ethers.provider.getBalance(await manager.getAddress())).to.equal(0n);
  });

  it("pays the whole allocation one second after the end", async () => {
    const after = await claimAt(manager, alice, 1n, end + 1n);
    expect(after.event.amount).to.equal(TOTAL);
  });

  it("reports claimableAmount as vested minus already claimed", async () => {
    await claimAt(manager, alice, 1n, start + CLIFF);

    const latest = await currentTimestamp();
    const expected =
      (TOTAL * (latest - start)) / DURATION - (TOTAL * CLIFF) / DURATION;
    expect(await manager.claimableAmount(1n)).to.equal(expected);
  });

  it("rejects duration == 0 at creation", async () => {
    await expect(
      manager.createNativeSchedules(
        [
          scheduleInput({
            beneficiary: alice.address,
            start,
            duration: 0n,
            totalAmount: 1n,
          }),
        ],
        { value: 1n },
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidDuration");
  });

  it("rejects cliff > duration at creation", async () => {
    await expect(
      manager.createNativeSchedules(
        [
          scheduleInput({
            beneficiary: alice.address,
            start,
            cliffDuration: DURATION + 1n,
            duration: DURATION,
            totalAmount: 1n,
          }),
        ],
        { value: 1n },
      ),
    )
      .to.be.revertedWithCustomError(manager, "InvalidCliff")
      .withArgs(DURATION + 1n, DURATION);
  });
});

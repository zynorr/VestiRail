import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  claimAt,
  currentTimestamp,
  deployManager,
  scheduleInput,
  setNextBlockTimestamp,
} from "./utils";
import { vestedAmount } from "../shared/vesting";

/** Deterministic PRNG so failures are reproducible. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

const random = createRandom(0x0b07c4);
const nextInt = (max: number) => random() % max;

const FOUR_YEARS_SECONDS = 126_144_000;

type Terms = {
  totalAmount: bigint;
  start: bigint;
  cliffDuration: bigint;
  duration: bigint;
};

function randomTerms(): Terms {
  const start = 1_000n + BigInt(nextInt(2_000_000_000));
  const duration = 1n + BigInt(nextInt(FOUR_YEARS_SECONDS));
  const cliffDuration = BigInt(nextInt(Number(duration) + 1));
  const totalAmount =
    ((BigInt(nextInt(1_000_000_000)) * 1_000_000_000n +
      BigInt(nextInt(1_000_000_000))) %
      10n ** 30n) +
    1n;
  return { totalAmount, start, cliffDuration, duration };
}

function boundaryTimestamps(terms: Terms): bigint[] {
  const { start, cliffDuration, duration } = terms;
  const cliffStart = start + cliffDuration;
  const end = start + duration;
  return [
    start - 1n,
    start,
    cliffStart - 1n,
    cliffStart,
    cliffStart + 1n,
    start + duration / 2n,
    end - 1n,
    end,
    end + 1n,
  ];
}

describe("Vesting formula parity: shared TypeScript module vs deployed contract", () => {
  let manager: any;
  let harness: any;
  let alice: any;
  let deployer: any;

  beforeEach(async () => {
    [deployer, alice] = await ethers.getSigners();
    manager = await deployManager();
    harness = await ethers.deployContract("VestingMathHarness");
    await harness.waitForDeployment();
  });

  it("agrees with the contract library on 200 randomized schedules at all boundaries", async () => {
    const cases: Terms[] = Array.from({ length: 200 }, randomTerms);

    for (const terms of cases) {
      for (const timestamp of boundaryTimestamps(terms)) {
        if (timestamp < 0n) continue;
        const onChain = await harness.vested(
          terms.totalAmount,
          terms.start,
          terms.cliffDuration,
          terms.duration,
          timestamp,
        );
        const offChain = vestedAmount(terms, timestamp);
        expect(onChain, `mismatch at t=${timestamp} for ${JSON.stringify(terms, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`).to.equal(offChain);
      }
    }
  });

  it("agrees on explicit edge cases", async () => {
    const edgeCases: Terms[] = [
      { totalAmount: 0n, start: 1_000n, cliffDuration: 0n, duration: 1_000n },
      { totalAmount: 1n, start: 1_000n, cliffDuration: 0n, duration: 1n },
      { totalAmount: 1n, start: 1_000n, cliffDuration: 1n, duration: 1n },
      { totalAmount: 10n ** 30n, start: 0n, cliffDuration: 0n, duration: 0n },
      { totalAmount: 10n ** 30n, start: 0n, cliffDuration: 0n, duration: 1n },
      { totalAmount: 3n, start: 3n, cliffDuration: 1n, duration: 7n },
    ];

    const timestamps = [0n, 1n, 2n, 3n, 4n, 7n, 9n, 10n, 11n, 1_000_000n];

    for (const terms of edgeCases) {
      for (const timestamp of timestamps) {
        expect(
          await harness.vested(
            terms.totalAmount,
            terms.start,
            terms.cliffDuration,
            terms.duration,
            timestamp,
          ),
        ).to.equal(vestedAmount(terms, timestamp));
      }
    }
  });

  it("matches the on-chain view for schedules created through the manager", async () => {
    const start = (await currentTimestamp()) + 500n;
    const terms = Array.from({ length: 10 }, (_, index) => {
      const generated = randomTerms();
      return {
        totalAmount: (generated.totalAmount % 10n ** 18n) + 1n,
        start,
        cliffDuration: generated.cliffDuration % generated.duration,
        duration: generated.duration,
        label: index,
      };
    });

    const inputs = terms.map((term) =>
      scheduleInput({
        beneficiary: alice.address,
        start: term.start,
        cliffDuration: term.cliffDuration,
        duration: term.duration,
        totalAmount: term.totalAmount,
      }),
    );
    const total = terms.reduce((sum, term) => sum + term.totalAmount, 0n);

    const ids: bigint[] = await manager.createNativeSchedules.staticCall(inputs, {
      value: total,
    });
    await manager.createNativeSchedules(inputs, { value: total });

    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      for (const timestamp of [
        term.start - 1n,
        term.start + term.cliffDuration,
        term.start + term.duration / 2n,
        term.start + term.duration - 1n,
        term.start + term.duration,
        term.start + term.duration + 1n,
      ]) {
        expect(await manager.vestedAmount(ids[i], timestamp)).to.equal(
          vestedAmount(term, timestamp),
        );
      }
    }
  });

  it("pays exactly the amount the shared formula predicts at cliff and end boundaries", async () => {
    const start = (await currentTimestamp()) + 100n;
    const cliffDuration = 1_000n;
    const duration = 4_000n;
    const total = ethers.parseEther("1000");
    const terms: Terms = { totalAmount: total, start, cliffDuration, duration };

    const inputs = Array.from({ length: 4 }, () =>
      scheduleInput({
        beneficiary: alice.address,
        start,
        cliffDuration,
        duration,
        totalAmount: total,
      }),
    );
    const ids: bigint[] = await manager.createNativeSchedules.staticCall(inputs, {
      value: total * 4n,
    });
    await manager.createNativeSchedules(inputs, { value: total * 4n });

    // One second before the cliff: nothing claimable.
    await setNextBlockTimestamp(start + cliffDuration - 1n);
    await expect(manager.connect(alice).claim(ids[0]))
      .to.be.revertedWithCustomError(manager, "NothingToClaim")
      .withArgs(ids[0]);

    const atCliff = await claimAt(manager, alice, ids[0], start + cliffDuration);
    expect(atCliff.event.amount).to.equal(
      vestedAmount(terms, atCliff.blockTimestamp),
    );
    expect(atCliff.event.amount).to.equal(ethers.parseEther("250"));

    const beforeEnd = await claimAt(
      manager,
      alice,
      ids[1],
      start + duration - 1n,
    );
    expect(beforeEnd.event.amount).to.equal(
      vestedAmount(terms, beforeEnd.blockTimestamp),
    );

    const atEnd = await claimAt(manager, alice, ids[2], start + duration);
    expect(atEnd.event.amount).to.equal(vestedAmount(terms, atEnd.blockTimestamp));
    expect(atEnd.event.amount).to.equal(total);

    const afterEnd = await claimAt(
      manager,
      alice,
      ids[3],
      start + duration + 3_600n,
    );
    expect(afterEnd.event.amount).to.equal(total);
  });

  it("pays progressive claims that sum to the formula's total", async () => {
    const start = (await currentTimestamp()) + 100n;
    const cliffDuration = 500n;
    const duration = 2_000n;
    const total = ethers.parseEther("1000");
    const terms: Terms = { totalAmount: total, start, cliffDuration, duration };

    const inputs = [
      scheduleInput({
        beneficiary: alice.address,
        start,
        cliffDuration,
        duration,
        totalAmount: total,
      }),
    ];
    const [id] = await manager.createNativeSchedules.staticCall(inputs, {
      value: total,
    });
    await manager.createNativeSchedules(inputs, { value: total });

    let claimed = 0n;
    for (const timestamp of [
      start + 500n,
      start + 750n,
      start + 1_500n,
      start + 2_000n,
    ]) {
      const claim = await claimAt(manager, alice, id, timestamp);
      const expectedDelta = vestedAmount(terms, claim.blockTimestamp) - claimed;
      expect(claim.event.amount).to.equal(expectedDelta);
      claimed += claim.event.amount;
    }

    expect(claimed).to.equal(total);

    await expect(manager.connect(alice).claim(id))
      .to.be.revertedWithCustomError(manager, "NothingToClaim")
      .withArgs(id);
  });

  it("exposes claimableAmount equal to the shared formula minus claimed", async () => {
    const start = (await currentTimestamp()) + 100n;
    const total = ethers.parseEther("1000");
    const terms: Terms = {
      totalAmount: total,
      start,
      cliffDuration: 0n,
      duration: 1_000n,
    };

    const inputs = [
      scheduleInput({
        beneficiary: alice.address,
        start,
        cliffDuration: 0n,
        duration: 1_000n,
        totalAmount: total,
      }),
    ];
    const [id] = await manager.createNativeSchedules.staticCall(inputs, {
      value: total,
    });
    await manager.createNativeSchedules(inputs, { value: total });

    const claim = await claimAt(manager, alice, id, start + 300n);
    const latest = BigInt(await time.latest());

    expect(claim.event.amount).to.equal(vestedAmount(terms, start + 300n));
    expect(await manager.claimableAmount(id)).to.equal(
      vestedAmount(terms, latest) - claim.event.amount,
    );
  });

  it("uses the same floor rounding as the frontend for awkward divisions", async () => {
    // 1e18 + 7 wei over a prime number of seconds forces non-terminating math.
    const terms: Terms = {
      totalAmount: ethers.parseEther("1") + 7n,
      start: 1_700_000_000n,
      cliffDuration: 0n,
      duration: 7_919n,
    };

    for (let offset = 0n; offset <= terms.duration; offset += 13n) {
      const timestamp = terms.start + offset;
      expect(
        await harness.vested(
          terms.totalAmount,
          terms.start,
          terms.cliffDuration,
          terms.duration,
          timestamp,
        ),
      ).to.equal(vestedAmount(terms, timestamp));
    }
  });
});

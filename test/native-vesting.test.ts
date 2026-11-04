import { expect } from "chai";
import { ethers } from "hardhat";
import {
  claimAt,
  currentTimestamp,
  deployManager,
  scheduleInput,
  setNextBlockTimestamp,
  sumAmounts,
  ZERO,
} from "./utils";

const TOTAL = ethers.parseEther("1000");
const CLIFF = 1_000n;
const DURATION = 4_000n;

describe("VestingManager: native BOT vesting", () => {
  let manager: any;
  let managerAddress: string;
  let deployer: any;
  let alice: any;
  let bob: any;
  let carol: any;
  let start: bigint;

  beforeEach(async () => {
    [deployer, alice, bob, carol] = await ethers.getSigners();
    manager = await deployManager();
    managerAddress = await manager.getAddress();
    start = (await currentTimestamp()) + 1_000n;
  });

  const create = (inputs: any[], value?: bigint) =>
    manager.createNativeSchedules(inputs, {
      value: value === undefined ? sumAmounts(inputs) : value,
    });

  describe("exact funding verification", () => {
    it("accepts funding equal to the exact sum of the schedules", async () => {
      const inputs = [
        scheduleInput({
          beneficiary: alice.address,
          start,
          totalAmount: ethers.parseEther("1"),
        }),
        scheduleInput({
          beneficiary: bob.address,
          start,
          totalAmount: ethers.parseEther("2"),
        }),
      ];

      await expect(create(inputs))
        .to.emit(manager, "SchedulesCreated")
        .withArgs(deployer.address, ZERO, 1n, 2n, ethers.parseEther("3"));

      expect(await ethers.provider.getBalance(managerAddress)).to.equal(
        ethers.parseEther("3"),
      );
      expect(await manager.totalFunded(ZERO)).to.equal(ethers.parseEther("3"));
      expect(await manager.nextScheduleId()).to.equal(3n);
    });

    it("rejects under-funding by one wei and creates nothing", async () => {
      const inputs = [
        scheduleInput({ beneficiary: alice.address, start, totalAmount: 1_000_000n }),
      ];

      await expect(create(inputs, 999_999n))
        .to.be.revertedWithCustomError(manager, "IncorrectFunding")
        .withArgs(1_000_000n, 999_999n);

      expect(await manager.nextScheduleId()).to.equal(1n);
      expect(await ethers.provider.getBalance(managerAddress)).to.equal(0n);
      expect(await manager.totalFunded(ZERO)).to.equal(0n);
    });

    it("rejects over-funding by one wei and creates nothing", async () => {
      const inputs = [
        scheduleInput({ beneficiary: alice.address, start, totalAmount: 1_000_000n }),
      ];

      await expect(create(inputs, 1_000_001n))
        .to.be.revertedWithCustomError(manager, "IncorrectFunding")
        .withArgs(1_000_000n, 1_000_001n);
    });

    it("requires a non-zero amount and beneficiary", async () => {
      await expect(
        create([scheduleInput({ beneficiary: alice.address, start, totalAmount: 0n })], 0n),
      ).to.be.revertedWithCustomError(manager, "InvalidAmount");

      await expect(
        create([scheduleInput({ beneficiary: ZERO, start, totalAmount: 1n })], 1n),
      )
        .to.be.revertedWithCustomError(manager, "InvalidBeneficiary")
        .withArgs(ZERO);
    });
  });

  describe("multiple beneficiaries", () => {
    it("keeps each beneficiary's allocation and claim independent", async () => {
      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          duration: DURATION,
          totalAmount: ethers.parseEther("1000"),
        }),
        scheduleInput({
          beneficiary: bob.address,
          start,
          duration: DURATION,
          totalAmount: ethers.parseEther("500"),
        }),
        scheduleInput({
          beneficiary: carol.address,
          start,
          duration: DURATION,
          totalAmount: ethers.parseEther("250"),
        }),
      ]);

      // 40% / 50% / 75% of each schedule, at three exact timestamps.
      const aliceClaim = await claimAt(manager, alice, 1n, start + 1_600n);
      const bobClaim = await claimAt(manager, bob, 2n, start + 2_000n);
      const carolClaim = await claimAt(manager, carol, 3n, start + 3_000n);

      expect(aliceClaim.event.amount).to.equal(ethers.parseEther("400"));
      expect(bobClaim.event.amount).to.equal(ethers.parseEther("250"));
      expect(carolClaim.event.amount).to.equal(ethers.parseEther("187.5"));

      expect(await ethers.provider.getBalance(managerAddress)).to.equal(
        ethers.parseEther("1750") -
          ethers.parseEther("400") -
          ethers.parseEther("250") -
          ethers.parseEther("187.5"),
      );

      // Bob cannot touch Alice's schedule.
      await expect(manager.connect(bob).claim(1n))
        .to.be.revertedWithCustomError(manager, "NotBeneficiary")
        .withArgs(bob.address, 1n);
    });
  });

  describe("partial and final claims", () => {
    it("pays vested amounts progressively and the exact remainder at the end", async () => {
      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          cliffDuration: 0n,
          duration: 1_000n,
          totalAmount: TOTAL,
        }),
      ]);

      const first = await claimAt(manager, alice, 1n, start + 250n);
      expect(first.event.amount).to.equal(ethers.parseEther("250"));
      expect(await ethers.provider.getBalance(managerAddress)).to.equal(
        ethers.parseEther("750"),
      );

      const second = await claimAt(manager, alice, 1n, start + 600n);
      expect(second.event.amount).to.equal(ethers.parseEther("350"));
      expect(await ethers.provider.getBalance(managerAddress)).to.equal(
        ethers.parseEther("400"),
      );

      const final = await claimAt(manager, alice, 1n, start + 1_000n);
      expect(final.event.amount).to.equal(ethers.parseEther("400"));
      expect(await ethers.provider.getBalance(managerAddress)).to.equal(0n);

      expect(await manager.totalClaimed(ZERO)).to.equal(TOTAL);
      expect(await manager.totalFunded(ZERO)).to.equal(TOTAL);
      expect(await manager.unclaimedLiability(ZERO)).to.equal(0n);
    });

    it("pays out exactly the same total when claimed once at the end", async () => {
      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          duration: 1_000n,
          totalAmount: TOTAL,
        }),
      ]);

      const { event } = await claimAt(manager, alice, 1n, start + 1_000n);
      expect(event.amount).to.equal(TOTAL);
    });

    it("emits the schedule id, beneficiary, native asset and amount", async () => {
      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          duration: 1_000n,
          totalAmount: TOTAL,
        }),
      ]);

      const { event } = await claimAt(manager, alice, 1n, start + 1_000n);
      expect(event.scheduleId).to.equal(1n);
      expect(event.beneficiary).to.equal(alice.address);
      expect(event.token).to.equal(ZERO);
      expect(event.amount).to.equal(TOTAL);
    });
  });

  describe("early and duplicate claim prevention", () => {
    it("rejects claims before start and before the cliff", async () => {
      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          cliffDuration: CLIFF,
          duration: DURATION,
          totalAmount: TOTAL,
        }),
      ]);

      for (const timestamp of [start - 1n, start, start + CLIFF - 1n]) {
        await setNextBlockTimestamp(timestamp);
        await expect(manager.connect(alice).claim(1n))
          .to.be.revertedWithCustomError(manager, "NothingToClaim")
          .withArgs(1n);
      }

      // Still nothing claimed.
      expect(await manager.totalClaimed(ZERO)).to.equal(0n);
    });

    it("rejects a duplicate claim immediately after a full claim", async () => {
      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          duration: 1_000n,
          totalAmount: TOTAL,
        }),
      ]);

      await claimAt(manager, alice, 1n, start + 1_000n);

      await expect(manager.connect(alice).claim(1n))
        .to.be.revertedWithCustomError(manager, "NothingToClaim")
        .withArgs(1n);

      // Nothing left in the contract and no double payout recorded.
      expect(await ethers.provider.getBalance(managerAddress)).to.equal(0n);
      expect(await manager.totalClaimed(ZERO)).to.equal(TOTAL);
    });

    it("rejects a second claim while no additional wei has vested", async () => {
      // 500 wei over 1000 seconds: one second of accrual floors to zero wei.
      await create(
        [
          scheduleInput({
            beneficiary: alice.address,
            start,
            cliffDuration: 0n,
            duration: 1_000n,
            totalAmount: 500n,
          }),
        ],
        500n,
      );

      const first = await claimAt(manager, alice, 1n, start + 500n);
      expect(first.event.amount).to.equal(250n);

      await setNextBlockTimestamp(start + 501n);
      await expect(manager.connect(alice).claim(1n))
        .to.be.revertedWithCustomError(manager, "NothingToClaim")
        .withArgs(1n);
    });

    it("rejects claims by non-beneficiaries", async () => {
      await create([
        scheduleInput({ beneficiary: alice.address, start, totalAmount: TOTAL }),
      ]);

      await expect(manager.connect(bob).claim(1n))
        .to.be.revertedWithCustomError(manager, "NotBeneficiary")
        .withArgs(bob.address, 1n);
    });

    it("rejects unknown schedule ids", async () => {
      await expect(manager.connect(alice).claim(0n))
        .to.be.revertedWithCustomError(manager, "UnknownSchedule")
        .withArgs(0n);

      await expect(manager.connect(alice).claim(99n))
        .to.be.revertedWithCustomError(manager, "UnknownSchedule")
        .withArgs(99n);
    });
  });

  describe("payout safety", () => {
    it("blocks reentrancy during a native payout", async () => {
      const reentrant = await ethers.deployContract("ReentrantBeneficiary", [
        managerAddress,
      ]);
      await reentrant.waitForDeployment();
      const reentrantAddress = await reentrant.getAddress();

      const claimStart = (await currentTimestamp()) + 100n;
      await create([
        scheduleInput({
          beneficiary: reentrantAddress,
          start: claimStart,
          duration: 1_000n,
          totalAmount: ethers.parseEther("1"),
        }),
      ]);
      await reentrant.setSchedule(1n);

      await setNextBlockTimestamp(claimStart + 1_000n);
      await reentrant.claimAsBeneficiary();

      const reentrancySelector = manager.interface.getError("Reentrancy").selector;
      expect(await reentrant.reentryAttempts()).to.equal(1n);
      expect(await reentrant.reentryRevertSelector()).to.equal(reentrancySelector);
      expect(await reentrant.received()).to.equal(ethers.parseEther("1"));
      expect(await ethers.provider.getBalance(managerAddress)).to.equal(0n);
      expect(await manager.totalClaimed(ZERO)).to.equal(ethers.parseEther("1"));
    });

    it("tracks beneficiary schedule ids and schedule records", async () => {
      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          cliffDuration: 10n,
          duration: 100n,
          totalAmount: 5n,
        }),
        scheduleInput({
          beneficiary: alice.address,
          start,
          totalAmount: 7n,
        }),
        scheduleInput({ beneficiary: bob.address, start, totalAmount: 9n }),
      ]);

      expect(await manager.beneficiaryScheduleIds(alice.address)).to.deep.equal([
        1n,
        2n,
      ]);

      const schedule = await manager.getSchedule(2n);
      expect(schedule.beneficiary).to.equal(alice.address);
      expect(schedule.token).to.equal(ZERO);
      expect(schedule.start).to.equal(start);
      expect(schedule.cliffDuration).to.equal(0n);
      expect(schedule.duration).to.equal(86_400n);
      expect(schedule.totalAmount).to.equal(7n);
      expect(schedule.claimedAmount).to.equal(0n);
    });
  });
});

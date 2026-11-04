import { expect } from "chai";
import { ethers } from "hardhat";
import {
  claimAt,
  currentTimestamp,
  deployManager,
  deployMockToken,
  scheduleInput,
  setNextBlockTimestamp,
  sumAmounts,
  ZERO,
} from "./utils";

const TOTAL = ethers.parseEther("1000");

describe("VestingManager: ERC-20 vesting", () => {
  let manager: any;
  let managerAddress: string;
  let token: any;
  let tokenAddress: string;
  let deployer: any;
  let alice: any;
  let bob: any;
  let start: bigint;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    manager = await deployManager();
    managerAddress = await manager.getAddress();
    token = await deployMockToken("Vesting Token", "VEST");
    tokenAddress = await token.getAddress();
    start = (await currentTimestamp()) + 1_000n;

    await token.mint(deployer.address, ethers.parseEther("100000"));
    await token.approve(managerAddress, ethers.MaxUint256);
  });

  const create = (inputs: any[], value?: bigint) =>
    manager.createTokenSchedules(tokenAddress, inputs, {
      value: value === undefined ? 0n : value,
    });

  describe("exact funding verification", () => {
    it("accepts funding equal to the exact sum and moves exactly that amount", async () => {
      const inputs = [
        scheduleInput({
          beneficiary: alice.address,
          start,
          totalAmount: ethers.parseEther("3000"),
        }),
        scheduleInput({
          beneficiary: bob.address,
          start,
          totalAmount: ethers.parseEther("2000"),
        }),
      ];

      const deployerBefore = await token.balanceOf(deployer.address);

      await expect(create(inputs))
        .to.emit(manager, "SchedulesCreated")
        .withArgs(deployer.address, tokenAddress, 1n, 2n, ethers.parseEther("5000"));

      expect(await token.balanceOf(managerAddress)).to.equal(ethers.parseEther("5000"));
      expect(await token.balanceOf(deployer.address)).to.equal(
        deployerBefore - ethers.parseEther("5000"),
      );
      expect(await manager.totalFunded(tokenAddress)).to.equal(
        ethers.parseEther("5000"),
      );
      expect(await manager.totalFunded(ZERO)).to.equal(0n);
    });

    it("rejects funding when the allowance is short", async () => {
      await token.approve(managerAddress, ethers.parseEther("999"));

      const inputs = [
        scheduleInput({
          beneficiary: alice.address,
          start,
          totalAmount: ethers.parseEther("1000"),
        }),
      ];

      await expect(create(inputs))
        .to.be.revertedWithCustomError(token, "InsufficientAllowance")
        .withArgs(
          deployer.address,
          managerAddress,
          ethers.parseEther("999"),
          ethers.parseEther("1000"),
        );

      expect(await manager.nextScheduleId()).to.equal(1n);
      expect(await token.balanceOf(managerAddress)).to.equal(0n);
    });

    it("rejects fee-on-transfer tokens that under-deliver", async () => {
      const feeToken = await ethers.deployContract("FeeOnTransferERC20", [100n]);
      await feeToken.waitForDeployment();
      const feeTokenAddress = await feeToken.getAddress();

      await feeToken.mint(deployer.address, ethers.parseEther("1000"));
      await feeToken.approve(managerAddress, ethers.MaxUint256);

      const inputs = [
        scheduleInput({
          beneficiary: alice.address,
          start,
          totalAmount: ethers.parseEther("1000"),
        }),
      ];

      await expect(
        manager.createTokenSchedules(feeTokenAddress, inputs),
      )
        .to.be.revertedWithCustomError(manager, "IncorrectFunding")
        .withArgs(ethers.parseEther("1000"), ethers.parseEther("990"));

      expect(await manager.nextScheduleId()).to.equal(1n);
      expect(await manager.totalFunded(feeTokenAddress)).to.equal(0n);
    });

    it("rejects the native asset address for token creation", async () => {
      await expect(
        manager.createTokenSchedules(ZERO, [
          scheduleInput({ beneficiary: alice.address, start, totalAmount: 1n }),
        ]),
      ).to.be.revertedWithCustomError(manager, "InvalidToken");
    });

    it("supports ERC-20 tokens that return no data", async () => {
      const noReturn = await ethers.deployContract("NoReturnERC20");
      await noReturn.waitForDeployment();
      const noReturnAddress = await noReturn.getAddress();

      await noReturn.mint(deployer.address, ethers.parseEther("100"));
      await noReturn.approve(managerAddress, ethers.MaxUint256);

      await manager.createTokenSchedules(noReturnAddress, [
        scheduleInput({
          beneficiary: alice.address,
          start,
          duration: 1_000n,
          totalAmount: ethers.parseEther("100"),
        }),
      ]);

      const { event } = await claimAt(manager, alice, 1n, start + 1_000n);
      expect(event.amount).to.equal(ethers.parseEther("100"));
      expect(await noReturn.balanceOf(alice.address)).to.equal(ethers.parseEther("100"));
      expect(await noReturn.balanceOf(managerAddress)).to.equal(0n);
    });
  });

  describe("cliff and linear payouts in token units", () => {
    it("pays nothing before the cliff and the cliff slice exactly at it", async () => {
      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          cliffDuration: 1_000n,
          duration: 4_000n,
          totalAmount: TOTAL,
        }),
      ]);

      await setNextBlockTimestamp(start + 999n);
      await expect(manager.connect(alice).claim(1n))
        .to.be.revertedWithCustomError(manager, "NothingToClaim")
        .withArgs(1n);

      const { event } = await claimAt(manager, alice, 1n, start + 1_000n);
      expect(event.amount).to.equal(ethers.parseEther("250"));
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("250"));
    });

    it("pays partial claims and then the exact remainder at the end", async () => {
      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          duration: 1_000n,
          totalAmount: TOTAL,
        }),
      ]);

      const first = await claimAt(manager, alice, 1n, start + 400n);
      expect(first.event.amount).to.equal(ethers.parseEther("400"));

      const last = await claimAt(manager, alice, 1n, start + 1_000n);
      expect(last.event.amount).to.equal(ethers.parseEther("600"));

      expect(await token.balanceOf(alice.address)).to.equal(TOTAL);
      expect(await token.balanceOf(managerAddress)).to.equal(0n);
      expect(await manager.totalClaimed(tokenAddress)).to.equal(TOTAL);
      expect(await manager.unclaimedLiability(tokenAddress)).to.equal(0n);
    });

    it("rejects duplicate claims after full payout", async () => {
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
    });

    it("rejects claims by non-beneficiaries", async () => {
      await create([
        scheduleInput({ beneficiary: alice.address, start, totalAmount: TOTAL }),
      ]);

      await expect(manager.connect(bob).claim(1n))
        .to.be.revertedWithCustomError(manager, "NotBeneficiary")
        .withArgs(bob.address, 1n);
    });
  });

  describe("asset isolation", () => {
    it("keeps native and ERC-20 accounting separate", async () => {
      const nativeAmount = ethers.parseEther("2");
      await manager.createNativeSchedules(
        [
          scheduleInput({
            beneficiary: alice.address,
            start,
            duration: 1_000n,
            totalAmount: nativeAmount,
          }),
        ],
        { value: nativeAmount },
      );

      await create([
        scheduleInput({
          beneficiary: alice.address,
          start,
          duration: 1_000n,
          totalAmount: TOTAL,
        }),
      ]);

      const idNative = 1n;
      const idToken = 2n;

      await claimAt(manager, alice, idToken, start + 500n);

      expect(await manager.totalClaimed(tokenAddress)).to.equal(ethers.parseEther("500"));
      expect(await manager.totalClaimed(ZERO)).to.equal(0n);
      expect(await ethers.provider.getBalance(managerAddress)).to.equal(nativeAmount);
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("500"));

      const nativeClaim = await claimAt(manager, alice, idNative, start + 1_000n);
      expect(nativeClaim.event.amount).to.equal(nativeAmount);
      expect(await ethers.provider.getBalance(managerAddress)).to.equal(0n);
      expect(await token.balanceOf(managerAddress)).to.equal(ethers.parseEther("500"));
    });

    it("rejects adding an ERC-20 schedule with a mismatched funding sum", async () => {
      const inputs = [
        scheduleInput({
          beneficiary: alice.address,
          start,
          totalAmount: ethers.parseEther("10"),
        }),
      ];

      // Fund the manager with fewer tokens than the schedule requires.
      await token.approve(managerAddress, ethers.parseEther("9"));
      await expect(create(inputs)).to.be.revertedWithCustomError(
        token,
        "InsufficientAllowance",
      );

      // And reject a batch whose sum is not exactly what was approved/transferred.
      await token.approve(managerAddress, ethers.parseEther("10"));
      const before = await token.balanceOf(managerAddress);
      await create(inputs);
      const after = await token.balanceOf(managerAddress);
      expect(after - before).to.equal(ethers.parseEther("10"));
      expect(after - before).to.equal(sumAmounts(inputs));
    });
  });
});

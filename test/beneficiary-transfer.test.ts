import { expect } from "chai";
import { ethers } from "hardhat";
import {
  claimAt,
  currentTimestamp,
  deployManager,
  deployMockToken,
  scheduleInput,
  ZERO,
} from "./utils";

const TOTAL = ethers.parseEther("1000");

describe("VestingManager: beneficiary transfer", () => {
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

  const createFor = async (beneficiary: string, amount = TOTAL, duration = 1_000n) => {
    const inputs = [
      scheduleInput({
        beneficiary,
        start,
        cliffDuration: 0n,
        duration,
        totalAmount: amount,
      }),
    ];
    await manager.createNativeSchedules(inputs, { value: amount });
  };

  it("moves the whole position to the new beneficiary", async () => {
    await createFor(alice.address);

    await expect(manager.connect(alice).transferBeneficiary(1n, bob.address))
      .to.emit(manager, "BeneficiaryTransferred")
      .withArgs(1n, alice.address, bob.address);

    const schedule = await manager.getSchedule(1n);
    expect(schedule.beneficiary).to.equal(bob.address);
    expect(schedule.totalAmount).to.equal(TOTAL);
    expect(await manager.beneficiaryScheduleIds(bob.address)).to.deep.equal([1n]);
    expect(await manager.beneficiaryScheduleIds(alice.address)).to.deep.equal([]);

    // The old beneficiary can no longer claim.
    await expect(manager.connect(alice).claim(1n))
      .to.be.revertedWithCustomError(manager, "NotBeneficiary")
      .withArgs(alice.address, 1n);

    // The new beneficiary receives the accrued amount.
    const claim = await claimAt(manager, bob, 1n, start + 500n);
    expect(claim.event.amount).to.equal(ethers.parseEther("500"));
    expect(claim.event.beneficiary).to.equal(bob.address);
    expect(await ethers.provider.getBalance(managerAddress)).to.equal(
      ethers.parseEther("500"),
    );
  });

  it("carries already vested but unclaimed value across the transfer", async () => {
    await createFor(alice.address);

    const first = await claimAt(manager, alice, 1n, start + 300n);
    expect(first.event.amount).to.equal(ethers.parseEther("300"));

    await manager.connect(alice).transferBeneficiary(1n, carol.address);

    const second = await claimAt(manager, carol, 1n, start + 700n);
    expect(second.event.amount).to.equal(ethers.parseEther("400"));
    expect((await manager.getSchedule(1n)).claimedAmount).to.equal(
      ethers.parseEther("700"),
    );

    const final = await claimAt(manager, carol, 1n, start + 1_000n);
    expect(final.event.amount).to.equal(ethers.parseEther("300"));
    expect(await ethers.provider.getBalance(managerAddress)).to.equal(0n);
    expect(await manager.totalClaimed(ZERO)).to.equal(TOTAL);
  });

  it("supports chained transfers", async () => {
    await createFor(alice.address);

    await manager.connect(alice).transferBeneficiary(1n, bob.address);
    await manager.connect(bob).transferBeneficiary(1n, carol.address);

    expect((await manager.getSchedule(1n)).beneficiary).to.equal(carol.address);
    expect(await manager.beneficiaryScheduleIds(alice.address)).to.deep.equal([]);
    expect(await manager.beneficiaryScheduleIds(bob.address)).to.deep.equal([]);
    expect(await manager.beneficiaryScheduleIds(carol.address)).to.deep.equal([1n]);

    await expect(manager.connect(bob).claim(1n))
      .to.be.revertedWithCustomError(manager, "NotBeneficiary")
      .withArgs(bob.address, 1n);

    const claim = await claimAt(manager, carol, 1n, start + 1_000n);
    expect(claim.event.amount).to.equal(TOTAL);
  });

  it("only the current beneficiary may transfer", async () => {
    await createFor(alice.address);

    await expect(manager.connect(bob).transferBeneficiary(1n, bob.address))
      .to.be.revertedWithCustomError(manager, "NotBeneficiary")
      .withArgs(bob.address, 1n);

    await manager.connect(alice).transferBeneficiary(1n, carol.address);

    await expect(manager.connect(alice).transferBeneficiary(1n, alice.address))
      .to.be.revertedWithCustomError(manager, "NotBeneficiary")
      .withArgs(alice.address, 1n);
  });

  it("rejects the zero address and self-transfer", async () => {
    await createFor(alice.address);

    await expect(manager.connect(alice).transferBeneficiary(1n, ZERO))
      .to.be.revertedWithCustomError(manager, "InvalidBeneficiary")
      .withArgs(ZERO);

    await expect(manager.connect(alice).transferBeneficiary(1n, alice.address))
      .to.be.revertedWithCustomError(manager, "SameBeneficiary")
      .withArgs(alice.address);
  });

  it("rejects transfers of unknown schedules", async () => {
    await expect(manager.connect(alice).transferBeneficiary(0n, bob.address))
      .to.be.revertedWithCustomError(manager, "UnknownSchedule")
      .withArgs(0n);

    await expect(manager.connect(alice).transferBeneficiary(5n, bob.address))
      .to.be.revertedWithCustomError(manager, "UnknownSchedule")
      .withArgs(5n);
  });

  it("keeps the beneficiary index correct when one of several schedules moves", async () => {
    await createFor(alice.address, 100n, 1_000n);
    await createFor(alice.address, 200n, 2_000n);
    await createFor(alice.address, 300n, 3_000n);

    expect(await manager.beneficiaryScheduleIds(alice.address)).to.deep.equal([
      1n,
      2n,
      3n,
    ]);

    await manager.connect(alice).transferBeneficiary(2n, bob.address);

    const aliceIds = await manager.beneficiaryScheduleIds(alice.address);
    expect(aliceIds.length).to.equal(2);
    expect(aliceIds).to.not.include(2n);
    expect(await manager.beneficiaryScheduleIds(bob.address)).to.deep.equal([2n]);

    // Accounting is unchanged by a transfer.
    expect(await manager.totalFunded(ZERO)).to.equal(600n);
    expect(await manager.totalClaimed(ZERO)).to.equal(0n);
    expect(await ethers.provider.getBalance(managerAddress)).to.equal(600n);
  });

  it("transfers ERC-20 schedules with the token payout intact", async () => {
    const token = await deployMockToken("Transfer Token", "TRF");
    const tokenAddress = await token.getAddress();

    await token.mint(deployer.address, TOTAL);
    await token.approve(managerAddress, ethers.MaxUint256);
    await manager.createTokenSchedules(tokenAddress, [
      scheduleInput({
        beneficiary: alice.address,
        start,
        duration: 1_000n,
        totalAmount: TOTAL,
      }),
    ]);

    await manager.connect(alice).transferBeneficiary(1n, carol.address);
    await expect(manager.connect(alice).claim(1n)).to.be.revertedWithCustomError(
      manager,
      "NotBeneficiary",
    );

    const claim = await claimAt(manager, carol, 1n, start + 1_000n);
    expect(claim.event.token).to.equal(tokenAddress);
    expect(claim.event.amount).to.equal(TOTAL);
    expect(await token.balanceOf(carol.address)).to.equal(TOTAL);
    expect(await token.balanceOf(alice.address)).to.equal(0n);
    expect(await token.balanceOf(managerAddress)).to.equal(0n);
  });
});

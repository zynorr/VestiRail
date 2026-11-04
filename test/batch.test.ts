import { expect } from "chai";
import { ethers } from "hardhat";
import {
  currentTimestamp,
  deployManager,
  deployMockToken,
  scheduleInput,
  sumAmounts,
  ZERO,
} from "./utils";

describe("VestingManager: batch creation (max 25)", () => {
  let manager: any;
  let managerAddress: string;
  let deployer: any;
  let alice: any;
  let start: bigint;

  beforeEach(async () => {
    [deployer, alice] = await ethers.getSigners();
    manager = await deployManager();
    managerAddress = await manager.getAddress();
    start = (await currentTimestamp()) + 1_000n;

    expect(await manager.MAX_BATCH_SIZE()).to.equal(25n);
  });

  function makeInputs(count: number, amount = ethers.parseEther("1")) {
    return Array.from({ length: count }, (_, index) =>
      scheduleInput({
        beneficiary: ethers.Wallet.createRandom().address,
        start,
        duration: 30n * 86_400n,
        totalAmount: amount + BigInt(index),
      }),
    );
  }

  it("creates exactly 25 native schedules in one transaction", async () => {
    const inputs = makeInputs(25);
    const total = sumAmounts(inputs);

    const ids = await manager.createNativeSchedules.staticCall(inputs, {
      value: total,
    });
    expect(ids.length).to.equal(25);

    await manager.createNativeSchedules(inputs, { value: total });

    expect(await manager.nextScheduleId()).to.equal(26n);
    expect(await ethers.provider.getBalance(managerAddress)).to.equal(total);
    expect(await manager.totalFunded(ZERO)).to.equal(total);

    for (let i = 0; i < 25; i++) {
      const schedule = await manager.getSchedule(BigInt(i + 1));
      expect(schedule.beneficiary).to.equal(inputs[i].beneficiary);
      expect(schedule.totalAmount).to.equal(inputs[i].totalAmount);
    }
  });

  it("rejects 26 schedules", async () => {
    const inputs = makeInputs(26);
    const total = sumAmounts(inputs);

    await expect(
      manager.createNativeSchedules(inputs, { value: total }),
    )
      .to.be.revertedWithCustomError(manager, "InvalidBatchSize")
      .withArgs(26n);

    expect(await manager.nextScheduleId()).to.equal(1n);
  });

  it("rejects an empty batch", async () => {
    await expect(manager.createNativeSchedules([], { value: 0n }))
      .to.be.revertedWithCustomError(manager, "InvalidBatchSize")
      .withArgs(0n);
  });

  it("creates 25 ERC-20 schedules in one transaction", async () => {
    const token = await deployMockToken();
    const tokenAddress = await token.getAddress();

    await token.mint(deployer.address, ethers.parseEther("1000"));
    await token.approve(managerAddress, ethers.MaxUint256);

    const inputs = makeInputs(25, ethers.parseEther("10"));
    const total = sumAmounts(inputs);

    await manager.createTokenSchedules(tokenAddress, inputs);

    expect(await token.balanceOf(managerAddress)).to.equal(total);
    expect(await manager.totalFunded(tokenAddress)).to.equal(total);
    expect(await manager.nextScheduleId()).to.equal(26n);
  });

  it("continues ids sequentially across consecutive batches", async () => {
    const first = makeInputs(25);
    await manager.createNativeSchedules(first, { value: sumAmounts(first) });

    const second = makeInputs(2, ethers.parseEther("5"));
    await manager.createNativeSchedules(second, { value: sumAmounts(second) });

    expect(await manager.nextScheduleId()).to.equal(28n);

    const ids = await manager.beneficiaryScheduleIds(second[0].beneficiary);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(26n);

    const last = await manager.getSchedule(27n);
    expect(last.totalAmount).to.equal(second[1].totalAmount);
  });

  it("accepts the same beneficiary in multiple inputs with distinct ids", async () => {
    const inputs = [
      scheduleInput({ beneficiary: alice.address, start, totalAmount: 10n }),
      scheduleInput({ beneficiary: alice.address, start, totalAmount: 20n }),
      scheduleInput({ beneficiary: alice.address, start, totalAmount: 30n }),
    ];

    await manager.createNativeSchedules(inputs, { value: 60n });

    expect(await manager.beneficiaryScheduleIds(alice.address)).to.deep.equal([
      1n,
      2n,
      3n,
    ]);
  });

  it("validates every entry in a batch", async () => {
    const good = scheduleInput({ beneficiary: alice.address, start, totalAmount: 1n });

    await expect(
      manager.createNativeSchedules(
        [
          good,
          scheduleInput({ beneficiary: ZERO, start, totalAmount: 1n }),
          good,
        ],
        { value: 3n },
      ),
    )
      .to.be.revertedWithCustomError(manager, "InvalidBeneficiary")
      .withArgs(ZERO);

    await expect(
      manager.createNativeSchedules(
        [good, scheduleInput({ beneficiary: alice.address, start, totalAmount: 0n })],
        { value: 1n },
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidAmount");

    await expect(
      manager.createNativeSchedules(
        [
          good,
          scheduleInput({
            beneficiary: alice.address,
            start,
            duration: 10n,
            cliffDuration: 11n,
            totalAmount: 1n,
          }),
        ],
        { value: 2n },
      ),
    )
      .to.be.revertedWithCustomError(manager, "InvalidCliff")
      .withArgs(11n, 10n);

    expect(await manager.nextScheduleId()).to.equal(1n);
  });

  it("rejects a native batch whose value does not match the total", async () => {
    const inputs = makeInputs(25, ethers.parseEther("0.1"));
    const total = sumAmounts(inputs);

    await expect(
      manager.createNativeSchedules(inputs, { value: total - 1n }),
    )
      .to.be.revertedWithCustomError(manager, "IncorrectFunding")
      .withArgs(total, total - 1n);

    await expect(
      manager.createNativeSchedules(inputs, { value: total + 1n }),
    )
      .to.be.revertedWithCustomError(manager, "IncorrectFunding")
      .withArgs(total, total + 1n);
  });
});

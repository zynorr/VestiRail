import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";
import { vestedAmount } from "../shared/vesting";

const RECORD_PATH = path.join(process.cwd(), "deployments", "bot-testnet.json");

type TxRecord = {
  label: string;
  hash: string;
  url: string;
  blockNumber: number;
  gasUsed: string;
};

type DemoRecord = {
  startedAt: string;
  finishedAt?: string;
  rpcUrl: string;
  beneficiaries: { address: string; role: string }[];
  transactions: TxRecord[];
  revertChecks: { label: string; revertedWith: string; args?: string[] }[];
  parityChecks: {
    scheduleId: string;
    asset: string;
    timestamp: string;
    predicted: string;
    paid: string;
    match: boolean;
  }[];
  finalState: Record<string, string>;
};

async function main() {
  if (network.name !== "botTestnet") {
    throw new Error(`Run against the testnet: npx hardhat run scripts/demo-testnet.ts --network botTestnet`);
  }
  if (!fs.existsSync(RECORD_PATH)) {
    throw new Error(`Missing ${RECORD_PATH}. Run scripts/deploy.ts first.`);
  }

  const record = JSON.parse(fs.readFileSync(RECORD_PATH, "utf8"));
  const managerAddress: string = record.contracts.VestingManager.address;
  const tokenAddress: string = record.contracts.DemoERC20.address;
  const explorer: string = record.explorer;

  const manager = await ethers.getContractAt("VestingManager", managerAddress);
  const token = await ethers.getContractAt("MockERC20", tokenAddress);
  const [deployer] = await ethers.getSigners();

  const demo: DemoRecord = {
    startedAt: new Date().toISOString(),
    rpcUrl: record.rpcUrl,
    beneficiaries: [],
    transactions: [],
    revertChecks: [],
    parityChecks: [],
    finalState: {},
  };
  record.demo = demo;

  const save = () => {
    fs.writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`);
  };

  const send = async (label: string, promise: Promise<any>) => {
    const tx = await promise;
    const receipt = await tx.wait();
    const entry: TxRecord = {
      label,
      hash: tx.hash,
      url: `${explorer}/tx/${tx.hash}`,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };
    demo.transactions.push(entry);
    save();
    console.log(`  • ${label}\n    ${entry.url}\n    block ${entry.blockNumber}, gas ${entry.gasUsed}`);
    return { tx, receipt };
  };

  const captureRevert = async (
    label: string,
    action: () => Promise<unknown>,
    contracts: any[] = [manager, token],
  ) => {
    try {
      await action();
    } catch (error: any) {
      const data: string | undefined =
        error?.data ?? error?.info?.error?.data ?? error?.error?.data;
      let name = "revert";
      let args: string[] | undefined;
      if (typeof data === "string") {
        for (const contract of contracts) {
          try {
            const parsed = contract.interface.parseError(data);
            if (parsed) {
              name = parsed.name;
              args = parsed.args.map((value: any) => value.toString());
              break;
            }
          } catch {
            // try the next ABI
          }
        }
      }
      demo.revertChecks.push({ label, revertedWith: name, args });
      save();
      console.log(`  • ${label}\n    reverted with ${name}${args ? `(${args.join(", ")})` : ""} — no gas spent (eth_call)`);
      return;
    }
    throw new Error(`${label}: expected a revert but the call succeeded`);
  };

  const predict = async (
    scheduleId: bigint,
    asset: string,
    totalAmount: bigint,
    start: bigint,
    cliffDuration: bigint,
    duration: bigint,
    claimedBefore: bigint,
    paid: bigint,
    blockTimestamp: bigint,
  ) => {
    const predicted =
      vestedAmount({ totalAmount, start, cliffDuration, duration }, blockTimestamp) -
      claimedBefore;
    const match = predicted === paid;
    demo.parityChecks.push({
      scheduleId: scheduleId.toString(),
      asset,
      timestamp: blockTimestamp.toString(),
      predicted: predicted.toString(),
      paid: paid.toString(),
      match,
    });
    save();
    console.log(`    frontend formula predicted ${ethers.formatUnits(predicted, 18)} ${asset}`);
    console.log(`    contract paid          ${ethers.formatUnits(paid, 18)} ${asset}`);
    if (!match) throw new Error(`parity mismatch on schedule ${scheduleId}`);
  };

  const nativeBalance = await ethers.provider.getBalance(managerAddress);
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:  ${network.name} (chain ID ${record.chainId})`);
  console.log(`Manager:  ${managerAddress}`);
  console.log(`Deployer: ${deployer.address} (${ethers.formatEther(deployerBalance)} BOT)`);
  console.log(`Manager native balance: ${ethers.formatEther(nativeBalance)} BOT`);

  if (deployerBalance < ethers.parseEther("0.5")) {
    throw new Error("Deployer needs testnet BOT for funding and gas.");
  }

  console.log("\n== Preparing beneficiaries ==");
  const beneficiaryOne = ethers.Wallet.createRandom().connect(ethers.provider);
  const beneficiaryTwo = ethers.Wallet.createRandom().connect(ethers.provider);
  const beneficiaryThree = ethers.Wallet.createRandom().connect(ethers.provider);

  demo.beneficiaries = [
    { address: beneficiaryOne.address, role: "partial claims, beneficiary transfer" },
    { address: beneficiaryTwo.address, role: "fully vested claim, receives transferred schedule" },
    { address: beneficiaryThree.address, role: "early-claim rejection" },
  ];
  save();
  for (const beneficiary of demo.beneficiaries) {
    console.log(`  ${beneficiary.address} — ${beneficiary.role}`);
  }

  // Gas only; vesting funds come from the manager, never from these wallets.
  for (const wallet of [beneficiaryOne, beneficiaryTwo, beneficiaryThree]) {
    await send(`Fund ${wallet.address} with 0.03 BOT for gas`, deployer.sendTransaction({
      to: wallet.address,
      value: ethers.parseEther("0.03"),
    }));
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) throw new Error("missing latest block");
  const now = BigInt(latestBlock.timestamp);

  console.log("\n== Native BOT: exact funding ==");
  const nativeSchedules = [
    {
      beneficiary: beneficiaryOne.address,
      start: now - 1_800n,
      cliffDuration: 0n,
      duration: 3_600n,
      totalAmount: ethers.parseEther("1"),
    },
    {
      beneficiary: beneficiaryTwo.address,
      start: now - 7_200n,
      cliffDuration: 1_800n,
      duration: 3_600n,
      totalAmount: ethers.parseEther("0.5"),
    },
    {
      beneficiary: beneficiaryThree.address,
      start: now + 900n,
      cliffDuration: 300n,
      duration: 3_600n,
      totalAmount: ethers.parseEther("0.25"),
    },
  ];
  const nativeTotal = nativeSchedules.reduce((sum, s) => sum + s.totalAmount, 0n);
  console.log(`  total to fund: ${ethers.formatEther(nativeTotal)} BOT across 3 schedules`);

  await captureRevert("Native batch under-funded by 1 wei", () =>
    manager.createNativeSchedules.staticCall(nativeSchedules, {
      value: nativeTotal - 1n,
    }),
  );

  const firstNativeId = BigInt(await manager.nextScheduleId());
  await send(
    "Create 3 native schedules with exact funding",
    manager.createNativeSchedules(nativeSchedules, { value: nativeTotal }),
  );
  const nativeIds = [
    firstNativeId,
    firstNativeId + 1n,
    firstNativeId + 2n,
  ];
  console.log(`  schedule ids: ${nativeIds.join(", ")}`);

  console.log("\n== Native BOT: full final claim (fully vested schedule) ==");
  {
    const schedule = nativeSchedules[1];
    const id = nativeIds[1];
    const before = await ethers.provider.getBalance(managerAddress);
    const gasless = await manager
      .connect(beneficiaryTwo)
      .claim.staticCall(id)
      .catch(() => null);
    const { receipt } = await send(
      "Beneficiary 2 claims fully vested schedule",
      manager.connect(beneficiaryTwo).claim(id),
    );
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    if (!block) throw new Error("missing claim block");
    const paid = before - (await ethers.provider.getBalance(managerAddress));
    await predict(
      id,
      "BOT",
      schedule.totalAmount,
      schedule.start,
      schedule.cliffDuration,
      schedule.duration,
      0n,
      paid,
      BigInt(block.timestamp),
    );
    if (gasless !== schedule.totalAmount) {
      throw new Error("expected the full allocation at claim time");
    }
    console.log(`  manager BOT after claim: ${ethers.formatEther(await ethers.provider.getBalance(managerAddress))}`);
  }

  console.log("\n== Native BOT: partial claims ==");
  let scheduleOneClaimed = 0n;
  {
    const schedule = nativeSchedules[0];
    const id = nativeIds[0];

    const before = await ethers.provider.getBalance(managerAddress);
    const { receipt } = await send(
      "Beneficiary 1 partial claim #1 (mid-vesting)",
      manager.connect(beneficiaryOne).claim(id),
    );
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    if (!block) throw new Error("missing claim block");
    const paid = before - (await ethers.provider.getBalance(managerAddress));
    scheduleOneClaimed = paid;
    await predict(
      id,
      "BOT",
      schedule.totalAmount,
      schedule.start,
      schedule.cliffDuration,
      schedule.duration,
      0n,
      paid,
      BigInt(block.timestamp),
    );
    if (paid >= schedule.totalAmount) {
      throw new Error("expected a partial payout, not the full allocation");
    }

    console.log("  waiting 25s so the linear curve advances...");
    await new Promise((resolve) => setTimeout(resolve, 25_000));

    const beforeSecond = await ethers.provider.getBalance(managerAddress);
    const second = await send(
      "Beneficiary 1 partial claim #2 (25s later)",
      manager.connect(beneficiaryOne).claim(id),
    );
    const blockTwo = await ethers.provider.getBlock(second.receipt.blockNumber);
    if (!blockTwo) throw new Error("missing claim block");
    const paidTwo = beforeSecond - (await ethers.provider.getBalance(managerAddress));
    await predict(
      id,
      "BOT",
      schedule.totalAmount,
      schedule.start,
      schedule.cliffDuration,
      schedule.duration,
      scheduleOneClaimed,
      paidTwo,
      BigInt(blockTwo.timestamp),
    );
    scheduleOneClaimed += paidTwo;
  }

  console.log("\n== Native BOT: early claims are rejected ==");
  await captureRevert("Beneficiary 3 claims before the schedule starts", () =>
    manager.connect(beneficiaryThree).claim.staticCall(nativeIds[2]),
  );

  console.log("\n== Native BOT: beneficiary transfer ==");
  await send(
    "Beneficiary 1 transfers schedule to beneficiary 2",
    manager.connect(beneficiaryOne).transferBeneficiary(nativeIds[0], beneficiaryTwo.address),
  );
  await captureRevert("Old beneficiary tries to claim after transferring", () =>
    manager.connect(beneficiaryOne).claim.staticCall(nativeIds[0]),
  );
  {
    const before = await ethers.provider.getBalance(managerAddress);
    const { receipt } = await send(
      "New beneficiary claims the transferred schedule",
      manager.connect(beneficiaryTwo).claim(nativeIds[0]),
    );
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    if (!block) throw new Error("missing claim block");
    const paid = before - (await ethers.provider.getBalance(managerAddress));
    const schedule = nativeSchedules[0];
    await predict(
      nativeIds[0],
      "BOT",
      schedule.totalAmount,
      schedule.start,
      schedule.cliffDuration,
      schedule.duration,
      scheduleOneClaimed,
      paid,
      BigInt(block.timestamp),
    );
  }

  console.log("\n== ERC-20 (vBOT): exact funding and claims ==");
  await send("Mint 100 vBOT to deployer", token.mint(deployer.address, ethers.parseEther("100")));

  const tokenSchedules = [
    {
      beneficiary: beneficiaryOne.address,
      start: now - 1_800n,
      cliffDuration: 0n,
      duration: 3_600n,
      totalAmount: ethers.parseEther("10"),
    },
    {
      beneficiary: beneficiaryThree.address,
      start: now - 7_200n,
      cliffDuration: 1_800n,
      duration: 3_600n,
      totalAmount: ethers.parseEther("5"),
    },
  ];
  const tokenTotal = tokenSchedules.reduce((sum, s) => sum + s.totalAmount, 0n);

  await send(
    "Approve 14 vBOT (deliberately 1 short)",
    token.approve(managerAddress, ethers.parseEther("14")),
  );
  await captureRevert("ERC-20 batch creating 15 vBOT of schedules with 14 funded", () =>
    manager.createTokenSchedules.staticCall(tokenAddress, tokenSchedules),
  );

  await send("Approve exact 15 vBOT", token.approve(managerAddress, tokenTotal));
  const firstTokenId = BigInt(await manager.nextScheduleId());
  await send(
    "Create 2 ERC-20 schedules with exact funding",
    manager.createTokenSchedules(tokenAddress, tokenSchedules),
  );
  const tokenIds = [firstTokenId, firstTokenId + 1n];
  console.log(`  schedule ids: ${tokenIds.join(", ")}`);
  console.log(`  manager vBOT: ${ethers.formatUnits(await token.balanceOf(managerAddress), 18)}`);
  if ((await token.balanceOf(managerAddress)) !== tokenTotal) {
    throw new Error("manager did not receive the exact token amount");
  }

  {
    const schedule = tokenSchedules[0];
    const before = await token.balanceOf(managerAddress);
    const { receipt } = await send(
      "Beneficiary 1 partial ERC-20 claim",
      manager.connect(beneficiaryOne).claim(tokenIds[0]),
    );
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    if (!block) throw new Error("missing claim block");
    const paid = before - (await token.balanceOf(managerAddress));
    await predict(
      tokenIds[0],
      "vBOT",
      schedule.totalAmount,
      schedule.start,
      schedule.cliffDuration,
      schedule.duration,
      0n,
      paid,
      BigInt(block.timestamp),
    );
    console.log(`  beneficiary 1 vBOT: ${ethers.formatUnits(await token.balanceOf(beneficiaryOne.address), 18)}`);
  }

  {
    const schedule = tokenSchedules[1];
    const before = await token.balanceOf(managerAddress);
    const { receipt } = await send(
      "Beneficiary 3 full ERC-20 claim",
      manager.connect(beneficiaryThree).claim(tokenIds[1]),
    );
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    if (!block) throw new Error("missing claim block");
    const paid = before - (await token.balanceOf(managerAddress));
    await predict(
      tokenIds[1],
      "vBOT",
      schedule.totalAmount,
      schedule.start,
      schedule.cliffDuration,
      schedule.duration,
      0n,
      paid,
      BigInt(block.timestamp),
    );
  }

  console.log("\n== Duplicate claim is rejected ==");
  await captureRevert("Beneficiary 3 claims the fully paid ERC-20 schedule again", () =>
    manager.connect(beneficiaryThree).claim.staticCall(tokenIds[1]),
  );

  demo.finalState = {
    managerNativeBalance: ethers.formatEther(await ethers.provider.getBalance(managerAddress)),
    managerTokenBalance: ethers.formatUnits(await token.balanceOf(managerAddress), 18),
    nativeTotalFunded: ethers.formatEther(await manager.totalFunded(ethers.ZeroAddress)),
    nativeTotalClaimed: ethers.formatEther(await manager.totalClaimed(ethers.ZeroAddress)),
    nativeLiability: ethers.formatEther(await manager.unclaimedLiability(ethers.ZeroAddress)),
    tokenTotalFunded: ethers.formatUnits(await manager.totalFunded(tokenAddress), 18),
    tokenTotalClaimed: ethers.formatUnits(await manager.totalClaimed(tokenAddress), 18),
    tokenLiability: ethers.formatUnits(await manager.unclaimedLiability(tokenAddress), 18),
    beneficiaryOneBot: ethers.formatEther(await ethers.provider.getBalance(beneficiaryOne.address)),
    beneficiaryTwoBot: ethers.formatEther(await ethers.provider.getBalance(beneficiaryTwo.address)),
    beneficiaryThreeBot: ethers.formatEther(await ethers.provider.getBalance(beneficiaryThree.address)),
    beneficiaryOneToken: ethers.formatUnits(await token.balanceOf(beneficiaryOne.address), 18),
    beneficiaryThreeToken: ethers.formatUnits(await token.balanceOf(beneficiaryThree.address), 18),
  };
  demo.finishedAt = new Date().toISOString();
  save();

  console.log("\n== Final state ==");
  for (const [key, value] of Object.entries(demo.finalState)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log(`\nAll ${demo.parityChecks.length} formula parity checks matched.`);
  console.log(`Recorded ${demo.transactions.length} transactions and ${demo.revertChecks.length} revert proofs.`);
  console.log(`Saved: ${RECORD_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

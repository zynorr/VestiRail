import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

const EXPLORERS: Record<string, string> = {
  botTestnet: "https://scan.bohr.life",
  botMainnet: "https://scan.botchain.ai",
};

const RECORD_PATH = path.join(process.cwd(), "deployments", "bot-testnet.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const balance = await ethers.provider.getBalance(deployer.address);
  const explorer = EXPLORERS[network.name] ?? "";
  const rpcUrl = network.config.url ?? "in-process";

  console.log(`Network:  ${network.name} (chain ID ${chainId})`);
  console.log(`RPC:      ${rpcUrl}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} BOT`);

  if (balance === 0n) {
    throw new Error(
      `Deployer ${deployer.address} has 0 BOT. Fund it at https://faucet.botchain.ai/basic (chain ID 968) and retry.`,
    );
  }

  console.log("\nDeploying VestingManager...");
  const manager = await ethers.deployContract("VestingManager");
  await manager.waitForDeployment();
  const managerTx = manager.deploymentTransaction();
  if (!managerTx) throw new Error("missing deployment transaction");
  const managerReceipt = await managerTx.wait();
  if (!managerReceipt) throw new Error("missing deployment receipt");
  const managerAddress = await manager.getAddress();

  console.log(`  address: ${managerAddress}`);
  console.log(`  tx:      ${explorer}/tx/${managerTx.hash}`);
  console.log(`  block:   ${managerReceipt.blockNumber}`);
  console.log(`  gas:     ${managerReceipt.gasUsed.toString()}`);

  console.log("\nDeploying demo ERC-20 (vBOT) used only for the funding/claim demo...");
  const token = await ethers.deployContract("MockERC20", [
    "BOT Vesting Demo Token",
    "vBOT",
  ]);
  await token.waitForDeployment();
  const tokenTx = token.deploymentTransaction();
  if (!tokenTx) throw new Error("missing token deployment transaction");
  const tokenReceipt = await tokenTx.wait();
  if (!tokenReceipt) throw new Error("missing token deployment receipt");
  const tokenAddress = await token.getAddress();

  console.log(`  address: ${tokenAddress}`);
  console.log(`  tx:      ${explorer}/tx/${tokenTx.hash}`);
  console.log(`  block:   ${tokenReceipt.blockNumber}`);
  console.log(`  gas:     ${tokenReceipt.gasUsed.toString()}`);

  const record = {
    network: network.name,
    chainId: chainId.toString(),
    rpcUrl,
    explorer,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    solc: "0.8.24",
    contracts: {
      VestingManager: {
        address: managerAddress,
        txHash: managerTx.hash,
        blockNumber: managerReceipt.blockNumber,
        gasUsed: managerReceipt.gasUsed.toString(),
        explorerUrl: `${explorer}/address/${managerAddress}`,
      },
      DemoERC20: {
        address: tokenAddress,
        txHash: tokenTx.hash,
        blockNumber: tokenReceipt.blockNumber,
        gasUsed: tokenReceipt.gasUsed.toString(),
        explorerUrl: `${explorer}/address/${tokenAddress}`,
        name: "BOT Vesting Demo Token",
        symbol: "vBOT",
        decimals: 18,
      },
    },
  };

  fs.mkdirSync(path.dirname(RECORD_PATH), { recursive: true });
  fs.writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`\nSaved deployment record: ${RECORD_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

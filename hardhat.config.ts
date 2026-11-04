import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import * as dotenv from "dotenv";

dotenv.config();

// Only a testnet key belongs here. .env is gitignored.
const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // BOT Chain is Geth-based; Shanghai is a safe, widely supported target.
      evmVersion: "shanghai",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Vesting tests fund schedules worth 1,000 BOT and leave them unclaimed
      // on purpose, so give each local account a large test balance.
      accounts: { accountsBalance: "1000000000000000000000000" },
    },
    botTestnet: {
      url: process.env.BOT_TESTNET_RPC_URL ?? "https://rpc.bohr.life",
      chainId: 968,
      accounts,
    },
  },
  mocha: {
    timeout: 180_000,
  },
};

export default config;

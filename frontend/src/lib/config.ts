export const CONFIG = {
  chainId: 968,
  chainName: "BOT Chain Testnet",
  rpcUrl: "https://rpc.bohr.life",
  explorer: "https://scan.bohr.life",
  manager: "0x6867b3EfC1a393fB165285d33daAAe6539FF682b",
  deployBlock: 29237029,
  deployer: "0xd61fDaAb767bB60D87739529cBf489C14C336148",
  demoToken: {
    address: "0x199201717E6e78cDDb6ffA1617E646cf4648f5b6",
    symbol: "vBOT",
    name: "BOT Vesting Demo Token",
    decimals: 18,
  },
  // Beneficiary used by the public read-only previews in this workspace.
  previewBeneficiary: "0x7D4fA25f674606f07d2fEB21938871Da6C95069F",
  refreshMs: 20_000,
  maxBatchSize: 25,
  fetchChunk: 2_000,
} as const;

export const EXPLORER = {
  address: (address: string) => `${CONFIG.explorer}/address/${address}`,
  tx: (hash: string) => `${CONFIG.explorer}/tx/${hash}`,
  block: (block: number) => `${CONFIG.explorer}/block/${block}`,
};

export const NATIVE = "0x0000000000000000000000000000000000000000";

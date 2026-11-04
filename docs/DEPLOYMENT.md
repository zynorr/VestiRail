# BOT Chain Testnet deployment and live demonstration

Milestone 1 deployment record. Every hash below is a confirmed transaction on
BOT Chain Testnet, and the state was re-read independently from the RPC after
the demo (not from script memory).

## Network

| Parameter | Value |
| --- | --- |
| Network | BOT Chain Testnet |
| Chain ID | 968 |
| RPC | https://rpc.bohr.life |
| Explorer | https://scan.bohr.life |
| Native token | BOT |
| Solidity | 0.8.24 (optimizer 200 runs, evmVersion shanghai) |
| Deployed at | 2026-11-04T10:14:19Z |
| Deployer | `0xd61fDaAb767bB60D87739529cBf489C14C336148` |

## Deployed contracts

| Contract | Address | Transaction | Block | Gas |
| --- | --- | --- | --- | --- |
| `VestingManager` | [`0x6867b3EfC1a393fB165285d33daAAe6539FF682b`](https://scan.bohr.life/address/0x6867b3EfC1a393fB165285d33daAAe6539FF682b) | [`0xc2c9d713…5a78ab`](https://scan.bohr.life/tx/0xc2c9d713a118863bb158d44af5d6255e368539004dacb93e333b9125275a78ab) | 29,237,029 | 1,316,555 |
| Demo ERC-20 `vBOT` | [`0x199201717E6e78cDDb6ffA1617E646cf4648f5b6`](https://scan.bohr.life/address/0x199201717E6e78cDDb6ffA1617E646cf4648f5b6) | [`0x78bd76c9…8f5cbd`](https://scan.bohr.life/tx/0x78bd76c953c20c5096bebe2cc5da5f966fc58af4c3e195cd6eb5a5eec88f5cbd) | 29,237,034 | 475,088 |

`vBOT` ("BOT Vesting Demo Token", 18 decimals) exists only to demonstrate ERC-20
vesting on testnet. It is a plain test ERC-20, not a production asset.

Full machine-readable record, including every demo transaction:
`deployments/bot-testnet.json`.

## Independent post-demo verification

Read directly from `https://rpc.bohr.life` after the demonstration:

| Check | Value |
| --- | --- |
| Chain ID | 968 |
| Deployed bytecode at manager | 5,637 bytes |
| `MAX_BATCH_SIZE()` | 25 |
| `nextScheduleId()` | 6 (5 schedules created) |
| Native `totalFunded` | 1.75 BOT |
| Native `totalClaimed` | 1.013055555555555555 BOT |
| Native `unclaimedLiability` | 0.736944444444444445 BOT |
| Native balance of manager | 0.736944444444444445 BOT |
| Token `totalFunded` | 15.0 vBOT |
| Token `totalClaimed` | 10.175 vBOT |
| Token `unclaimedLiability` | 4.825 vBOT |
| Token balance of manager | 4.825 vBOT |

**Solvency invariant holds exactly for both assets:**
`contract balance == totalFunded - totalClaimed == unclaimedLiability`.

## Beneficiaries used in the demonstration

| Address | Role |
| --- | --- |
| `0x7D4fA25f674606f07d2fEB21938871Da6C95069F` | partial claims, then transfers its native schedule |
| `0x15C450B5C09eb80c783102215fa5aAd4AC92a24F` | full claim of a fully vested schedule, receives the transferred schedule |
| `0xB94d0A7e9A41177D333A51757777B2d2B85FE230` | early-claim rejection, ERC-20 full claim |

These wallets were generated for the demo and funded with 0.03 BOT each purely
for gas. Their keys were not retained; the demo is reproducible with
`scripts/demo-testnet.ts`, which generates fresh beneficiaries each run.

## Demonstration timeline

### 1. Native BOT — exact funding

Three schedules, one transaction, `msg.value` exactly 1.75 BOT:

| Id | Beneficiary | Start | Cliff | Duration | Total |
| --- | --- | --- | --- | --- | --- |
| 1 | `0x7D4f…069F` | now − 1800s | 0s | 3600s | 1.0 BOT |
| 2 | `0x15C4…a24F` | now − 7200s | 1800s | 3600s | 0.5 BOT |
| 3 | `0xB94d…E230` | now + 900s | 300s | 3600s | 0.25 BOT |

- Under-funding by 1 wei was rejected before spending gas:
  `IncorrectFunding(1750000000000000000, 1749999999999999999)`.
- Exact funding tx: [`0x22cc3994…2500ca`](https://scan.bohr.life/tx/0x22cc39942c32052663c80b0456d530348f015210e56e90ebd08dc65de22500ca)
  (block 29,237,059, gas 400,049).

### 2. Full final claim (schedule 2, fully vested)

[`0x86f196e1…609e17`](https://scan.bohr.life/tx/0x86f196e14576231695522acc8de9897ce73b73ddf7462d81bb77935d2f609e17)
(block 29,237,065, gas 87,400)

- Frontend formula predicted `0.5 BOT`, contract paid `0.5 BOT`.
- Manager BOT balance 1.75 → 1.25.

### 3. Partial claims (schedule 1, mid-vesting)

| Claim | Transaction | Block | Predicted (shared TS) | Paid | Delta |
| --- | --- | --- | --- | --- | --- |
| #1 | [`0x14d57963…e509c`](https://scan.bohr.life/tx/0x14d57963118bf13515fa262f5c4e366a84bf8d009979764a9dd3471b9f9e509c) | 29,237,069 | 0.502777777777777777 BOT | 0.502777777777777777 BOT | 50.28% |
| #2 (25s later) | [`0xca387487…951e319`](https://scan.bohr.life/tx/0xca3874870d7ceceb40a55deec9c86b29d7c981404fe7478ac7e6aeb3d951e319) | 29,237,108 | 0.008055555555555556 BOT | 0.008055555555555556 BOT | +0.81% |

The second claim paid only the newly accrued fraction — the exact linear delta
between the two block timestamps, with no rounding drift.

### 4. Early claim rejected (schedule 3, starts in the future)

`NothingToClaim(3)` — simulated via `eth_call`, so no gas was spent and no state
changed. The beneficiary cannot claim before `start + cliff`.

### 5. Beneficiary transfer (schedule 1)

[`0xe38f9c1f…c550098`](https://scan.bohr.life/tx/0xe38f9c1ff35471eba2810e550da758c53ab8a2acadd0cd831d25b9c50c550098)
(block 29,237,114, gas 60,340)

- Old beneficiary `0x7D4f…069F` then tried to claim:
  `NotBeneficiary(0x7D4f…069F, 1)`.
- New beneficiary `0x15C4…a24F` claimed the accrued remainder:
  [`0xaa579903…8c7c7e5`](https://scan.bohr.life/tx/0xaa579903765778d6a41bf2b287f2ec45ab9b10fedeceb99153aab9e398c7c7e5)
  (block 29,237,118, gas 53,433). Predicted `0.002222222222222222 BOT`, paid
  `0.002222222222222222 BOT`.

### 6. ERC-20 (vBOT) — exact funding and claims

- Minted 100 vBOT to the deployer:
  [`0x9f00d076…707f7b`](https://scan.bohr.life/tx/0x9f00d07699aa8b75ebeb31b0b80db52c3f12d3a3a3d89ca9a2744268b2707f7b).
- Approved only 14 vBOT and tried to create 15 vBOT of schedules:
  rejected with `InsufficientAllowance(deployer, manager, 14e18, 15e18)`.
- Approved the exact 15 vBOT:
  [`0xd3d1660f…cbee2ea`](https://scan.bohr.life/tx/0xd3d1660ff4775e64030890ea93bbcff6fca0e33c7115392ff93ae21abcbee2ea).
- Created schedules 4 (10 vBOT, mid-vesting) and 5 (5 vBOT, fully vested) in one
  exact-funded transaction:
  [`0xa636ee40…2da59b`](https://scan.bohr.life/tx/0xa636ee40174a75e462dc3e725617ecae5a3b01f4b004cbc4a0c4fdf84a2da59b)
  (block 29,237,134, gas 304,454). Manager balance = exactly 15 vBOT.

| Claim | Transaction | Predicted | Paid |
| --- | --- | --- | --- |
| Schedule 4 partial | [`0x5955afcf…6356d5`](https://scan.bohr.life/tx/0x5955afcf527b76d89d00712b3d9c2e56c7cafc5a6b4d44007498620fb06356d5) | 5.175 vBOT | 5.175 vBOT |
| Schedule 5 full | [`0x544e0f77…0eac0`](https://scan.bohr.life/tx/0x544e0f775fa61cb371ba45022a62245484ed19ad3a9b59316b3f9037d8f0eac0) | 5.0 vBOT | 5.0 vBOT |

Duplicate claim on the fully paid schedule 5 was rejected with
`NothingToClaim(5)` (no gas spent).

## Result

- 15 confirmed transactions, 5 revert proofs, 6 formula parity checks —
  **all 6 predicted amounts matched the contract payout exactly**.
- Native: funded 1.75 BOT, claimed 1.013055555555555555 BOT, 0.736944444444444445 BOT
  still held for future vesting (schedule 1 remainder 0.486944444444444445 BOT +
  schedule 3's 0.25 BOT not yet started).
- ERC-20: funded 15 vBOT, claimed 10.175 vBOT, 4.825 vBOT still vesting on
  schedule 4.
- No admin function exists to move either balance; the held amounts are only
  reachable through beneficiary claims as the curves advance.

## Reproduce

```bash
npm install
npx hardhat test                       # 64 passing
npx hardhat run scripts/deploy.ts --network botTestnet
npx hardhat run scripts/demo-testnet.ts --network botTestnet
```

## Notes and limitations

- The contract is **not source-verified** on scan.bohr.life; the explorer's
  verification API requires an API key that was not available. Bytecode is live
  and all interactions above were performed against it.
- The demo waits 25 seconds between two partial claims to show real accrual, so a
  full run takes about 90 seconds.
- Beneficiary wallets are ephemeral by design; the record keeps their addresses
  and every transaction, not their private keys.
- This is a testnet demonstration with valueless test tokens. No mainnet
  deployment, no real funds, no revocation and no admin withdrawal exist in the
  contract.

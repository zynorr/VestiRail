# VestiRail — Token Vesting & Allocation Management

**Lock Allocations. Release on Schedule.**

VestiRail is a token allocation management product for projects on **BOT Chain**:
a marketing site, an operations workspace for administrators and a claim portal
for beneficiaries, all backed by one cliff + linear vesting contract.

The contract is deployed on BOT Chain Testnet with real funded schedules and
claims. The frontend is a Vite + React + TypeScript application that reads
contract state through a same-origin RPC proxy and signs real transactions.

## Layout

```
contracts/
  VestingManager.sol          native + ERC-20 vesting, exact funding, claims
  libraries/VestingMath.sol   the on-chain formula
  mocks/                      test-only tokens, math harness, reentrant beneficiary
shared/
  vesting.ts                  the ONLY vesting formula the frontend may import
test/                         contract, batch, transfer and formula-parity tests
scripts/                      deploy and testnet demo scripts
frontend/
  src/App.tsx                 router
  src/pages/                  Marketing, Overview, Schedules, ScheduleDetail,
                              CreateSchedule, Beneficiaries, BulkAllocations,
                              Activity, Reports, Portal, Tokens, Settings
  src/components/             AppShell, UnlockCurve, VestingTimeline,
                              AllocationBreakdown, ScheduleTable, ClaimPanel,
                              UI primitives and icon set
  src/context/                wallet session + contract workspace state
  src/lib/                    config, contract reads, derivation, formatting,
                              CSV parsing, local labels
  src/styles/                 tokens, base primitives, application, marketing
docs/
  VESTING_SPEC.md             formula spec and frontend integration rules
  TEST-RESULTS.md             test evidence mapped to requirements
  DEPLOYMENT.md               testnet addresses, transactions, demo results
```

## BOT Chain Testnet

| Parameter | Value |
| --- | --- |
| Chain ID | 968 |
| RPC | https://rpc.bohr.life |
| Explorer | https://scan.bohr.life |
| Native token | BOT (testnet tBOT) |
| Faucet | https://faucet.botchain.ai/basic |
| VestingManager | `0x6867b3EfC1a393fB165285d33daAAe6539FF682b` |

## Commands

```bash
npm install
npx hardhat compile
npx hardhat test

# Deploy (requires a funded testnet key in .env)
npx hardhat run scripts/deploy.ts --network botTestnet

# Fund schedules and execute real claims on testnet
npx hardhat run scripts/demo-testnet.ts --network botTestnet

# VestiRail (Vite, port 5175)
cd frontend && npm install && npm run dev
```

Open `http://127.0.0.1:5175`. Read-only contract data works without a wallet;
creating, funding and claiming require an injected wallet on chain 968.

## VestiRail frontend

### Routes

| Route | Experience |
| --- | --- |
| `/` | Marketing site with a product-led hero, vesting explainer, creation and bulk workflows, transparency and FAQ |
| `/app` | Overview: allocated / released / locked / claimable, timeframe chart, upcoming unlocks, schedule register |
| `/app/schedules` | Full register with status views, search, token + status filters, sorting, pagination and CSV export |
| `/app/schedules/:id` | Allocation record: figures, unlock curve, timeline, milestones, transaction history, claim panel |
| `/app/create` | Five-step creation workflow with live curve, exact funding, gas estimate, approval and confirmation states |
| `/app/beneficiaries` | Beneficiary register aggregated per wallet and token, with per-schedule profile |
| `/app/bulk` | CSV template, drag-and-drop upload, row validation, batch summary, batched on-chain execution |
| `/app/activity` | Decoded creation, claim and transfer events with filters and CSV export |
| `/app/reports` | Six operational CSV exports with source, chain time and sync disclosure |
| `/app/tokens` | Token registry discovered from schedules, with verified metadata |
| `/app/settings` | Network, contract, wallet session, local labels and data-integrity notes |
| `/portal` | Beneficiary portal: allocation summary, timelines, per-schedule and primary claim actions |

### Design system

`src/styles/tokens.css` defines the palette (warm off-white `#F7F8F6`, ink
`#17211F`, forest `#167A55`, emerald soft `#DDF3E7`), spacing, radii, shadows and
the Inter type stack with tabular numerals for financial values.
`src/styles/base.css` and `src/styles/app.css` provide buttons, fields, tables,
panels, status badges, modals, tabs, notices, tooltips, pagination, the sidebar
shell and responsive layouts. `src/styles/marketing.css` is the public-site
layer. All pages share these primitives rather than page-local components.

### Data integrity

- Contract state is authoritative. `fetchWorkspace` reads `nextScheduleId`,
  every `getSchedule` and the latest block, then computes vesting with
  `shared/vesting.ts` at that block timestamp.
- Amounts stay in base units (`bigint`) until display; dates are UTC.
- Event history is decoded from `SchedulesCreated`, `Claimed` and
  `BeneficiaryTransferred` logs. If the log query fails, claim history and
  cumulative claimed lines are hidden with an explanation; balances are never
  zero-filled or invented.
- Schedule labels and references are the only off-chain data, stored in
  `localStorage` and explicitly labelled as local.
- Statuses are derived: fully claimed, completed, claimable, active (in cliff),
  upcoming. There is no invented "accrued but unavailable" bucket because vested
  amounts are immediately claimable after the cliff.
- Creating a schedule calls `createNativeSchedules` or
  `createTokenSchedules`; ERC-20 funding requests an exact allowance first.
  Success is only reported after a receipt, and the new ID is read from the
  `SchedulesCreated` log.

### Verification performed

- `npx tsc --noEmit` — clean.
- `npx vite build` — production bundle built successfully.
- All twelve routes rendered against live testnet data with no console errors
  and no horizontal overflow at 390px and 1440px viewports.
- Bulk CSV parsing exercised with valid, duplicate, invalid-address, zero-amount
  and missing-amount rows; validation and summary were correct.
- Creation workflow exercised through token, beneficiary, vesting and review
  steps: the preview reported 25% vested at a 1-year cliff on a 4-year duration,
  matching `shared/vesting.ts`, and the create action stayed disabled until the
  immutability acknowledgement and a wallet were present.

Signing flows (claim, approval, schedule creation, batch execution) are wired to
the deployed contract but could not be executed end-to-end here because the test
browser has no injected wallet. They require a funded testnet wallet.

## Design guarantees

- **Exact funding.** Native batches require `msg.value == sum`; ERC-20 batches
  verify the received balance delta equals the sum, so fee-on-transfer tokens
  revert instead of creating an unfunded liability.
- **No admin powers.** No owner, no revocation, no sweep, no upgrade path, no
  pause. A funded schedule can only ever be paid to its beneficiary.
- **One formula.** `shared/vesting.ts` mirrors `VestingMath.sol`; a parity test
  proves equality across randomized schedules, boundary timestamps and real
  payouts.
- **No duplicate payouts.** `claimedAmount` is monotonic and a zero claimable
  amount reverts with `NothingToClaim`, which also covers pre-cliff claims.
- **Payout safety.** Checks-effects-interactions plus a reentrancy guard on
  claims; ERC-20 transfers tolerate non-returning tokens and bubble token
  revert reasons.

## Status

- Contracts: **64 passing, 0 failing** (`docs/TEST-RESULTS.md`).
- Testnet deployment and claims: `docs/DEPLOYMENT.md`.
- Frontend: implemented and verified read paths as described above; signing
  paths pending a wallet-enabled session.

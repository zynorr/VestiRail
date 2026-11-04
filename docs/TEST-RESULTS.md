# Test results — Milestone 1

Command: `npx hardhat test`
Network: local Hardhat network (chain ID 31337)
Solidity: 0.8.24, optimizer enabled (200 runs), evmVersion shanghai

**Result: 64 passing, 0 failing** (full output in `test-output.txt`).

## Requirement coverage

| # | Requirement | Where it is proven |
| --- | --- | --- |
| 1 | Native BOT vesting logic | `test/native-vesting.test.ts` — 15 tests: funding, multi-beneficiary payouts, partial/final claims, event args, schedule records |
| 2 | ERC-20 vesting logic | `test/erc20-vesting.test.ts` — 11 tests, including non-returning tokens and asset isolation |
| 3 | Exact funding verification | native: `accepts funding equal to the exact sum`, `rejects under-funding by one wei`, `rejects over-funding by one wei`; ERC-20: `accepts funding equal to the exact sum and moves exactly that amount`, `rejects fee-on-transfer tokens that under-deliver`, `rejects funding when the allowance is short` |
| 4 | Cliff + linear vesting mathematics | `test/vesting-math.test.ts` — 15 tests; cliff slice equals `total * cliff / duration`, linear from `start`, floor rounding |
| 5 | Multiple beneficiaries | `keeps each beneficiary's allocation and claim independent` (40% / 50% / 75% at three exact timestamps), plus cross-beneficiary claim rejection |
| 6 | Batch creation, max 25 | `test/batch.test.ts` — 8 tests: 25 succeeds, 26 reverts `InvalidBatchSize(26)`, empty reverts, ids sequential across batches, all entries validated |
| 7 | Partial claims | `pays vested amounts progressively and the exact remainder at the end` (250 / 350 / 400 of 1000 BOT); ERC-20 equivalent; transfer test also claims in two steps |
| 8 | Full final claims | `pays out exactly the same total when claimed once at the end`, `pays partial claims and then the exact remainder at the end`, `pays the whole allocation one second after the end`; contract balance reaches exactly 0 and `unclaimedLiability == 0` |
| 9 | Beneficiary transfer | `test/beneficiary-transfer.test.ts` — 8 tests: position moves, accrued value carries over, chained transfers, authorization, zero/self rejection, index maintenance, ERC-20 variant |
| 10 | Early and duplicate claim prevention | 1s before cliff reverts `NothingToClaim`, at cliff pays; duplicate after full claim reverts; second claim with no new wei reverts; non-beneficiary reverts; unknown ids revert; reentrancy blocked |

## Boundary timestamps

For a schedule with `start`, `cliff = 1000`, `duration = 4000`, `total = 1000 BOT`:

| Timestamp | Expected vested | Asserted |
| --- | --- | --- |
| `start - 1` | 0 | ✔ |
| `start` | 0 | ✔ |
| `start + 999` (1s before cliff) | 0 | ✔ |
| `start + 1000` (exactly cliff) | 250 BOT | ✔ (view + real claim) |
| `start + 1001` | `1000 * 1001 / 4000` | ✔ |
| `start + 2000` | 500 BOT | ✔ |
| `start + 3999` (1s before end) | 999.75 BOT | ✔ (view + real claim) |
| `start + 4000` (exactly end) | 1000 BOT | ✔ (view + real claim of the exact remainder) |
| `start + 4001` | 1000 BOT | ✔ (full claim) |

`cliff == duration` is asserted to unlock everything exactly at the end and
nothing 1 second earlier. `cliff == 0` is asserted to vest linearly from `start`.

## Formula parity (frontend ↔ contract)

`test/formula-parity.test.ts` — 7 tests:

- 200 randomized schedules (totals up to 1e30 base units, durations up to 4
  years) × 9 timestamps each, compared between `shared/vesting.ts` and the
  deployed `VestingMath` library: **1,800 comparisons**.
- Explicit edge cases: zero total, zero duration, zero cliff, 1-second duration.
- 10 schedules created through `VestingManager` compared at 6 timestamps each.
- Real payouts at `cliff - 1`, `cliff`, `end - 1`, `end`, `end + 1h` compared to
  the shared formula evaluated at the mined block timestamp.
- Progressive claims whose sum equals the formula's total, then duplicate-claim
  rejection.
- `claimableAmount()` equals the shared formula minus claimed.
- Prime-second duration (`7919s`) to force non-terminating division and confirm
  identical floor behavior.

## Security checks included

- Native reentrancy attempt from a malicious beneficiary is rejected with
  `Reentrancy`, and only one payout occurs.
- Non-beneficiaries cannot claim or transfer.
- Fee-on-transfer and short-allowance funding cannot create unbacked schedules.
- Contract native and token balances reach exactly zero after full claims.

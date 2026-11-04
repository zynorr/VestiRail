# Vesting specification (Milestone 1)

This document is the contract between `VestingManager.sol`, `VestingMath.sol` and
the future frontend. There is exactly **one** vesting formula, defined once in
Solidity and mirrored once in TypeScript.

## 1. Schedule model

| Field | Type | Meaning |
| --- | --- | --- |
| `beneficiary` | `address` | Only this address may claim or transfer the schedule |
| `token` | `address` | `address(0)` = native BOT, otherwise ERC-20 |
| `start` | `uint64` | Unix seconds at which accrual begins |
| `cliffDuration` | `uint64` | Seconds after `start` before anything can be claimed |
| `duration` | `uint64` | Total vesting length in seconds, measured from `start` |
| `totalAmount` | `uint128` | Total allocation in base units |
| `claimedAmount` | `uint128` | Amount already paid out |

Validation at creation: `duration > 0`, `cliffDuration <= duration`,
`totalAmount > 0`, `beneficiary != address(0)`, batch size `1..25`.

## 2. The formula

Solidity (`contracts/libraries/VestingMath.sol`):

```solidity
if (duration == 0) return 0;
uint256 startTime = uint256(start);
if (timestamp < startTime + uint256(cliffDuration)) return 0;
uint256 endTime = startTime + uint256(duration);
if (timestamp >= endTime) return totalAmount;
return (totalAmount * (timestamp - startTime)) / uint256(duration);
```

TypeScript (`shared/vesting.ts`, the only module the frontend may import):

```ts
if (duration === 0n) return 0n;
if (timestamp < start + cliffDuration) return 0n;
const end = start + duration;
if (timestamp >= end) return totalAmount;
return (totalAmount * (timestamp - start)) / duration;
```

Important properties:

1. **The cliff gates claims; it does not move the accrual origin.** At exactly
   `start + cliffDuration`, the vested amount is
   `totalAmount * cliffDuration / duration`, not zero and not the first slice
   of a curve that starts at the cliff. A 1-year cliff on a 4-year schedule
   unlocks 25% at the cliff.
2. **Vesting is linear from `start` to `start + duration`.**
3. **Exact end boundary.** At `timestamp == start + duration` the full amount is
   vested. At `start + duration - 1` it is `totalAmount * (duration - 1) / duration`.
4. **No accrual after the end**; the result is capped at `totalAmount`.
5. **Floor division.** Integer division truncates toward zero, in Solidity and in
   JavaScript `BigInt` alike. Never use `Number` in the frontend for token
   amounts: values exceed `Number.MAX_SAFE_INTEGER`.
6. **Zero duration** returns `0` in both implementations. The manager rejects
   such schedules, so this branch only guards the pure functions.

## 3. Boundary behaviour

| Timestamp | Vested | Claimable (nothing claimed yet) |
| --- | --- | --- |
| `start - 1` | 0 | 0 (claim reverts) |
| `start` | 0 if cliff > 0, else 0 | 0 |
| `start + cliff - 1` | 0 | 0 (claim reverts) |
| `start + cliff` | `total * cliff / duration` | same |
| `start + duration / 2` | `total * (duration / 2) / duration` | same |
| `start + duration - 1` | `total * (duration - 1) / duration` | same |
| `start + duration` | `total` | remaining after prior claims |
| `start + duration + 1` | `total` | same as at end |

## 4. Claims

- `claim(scheduleId)` pays `vestedAmount(now) - claimedAmount`.
- The caller must be the current beneficiary.
- If the difference is zero, the call reverts with `NothingToClaim`. This covers
  both "before the cliff" and "already fully claimed", which is what makes
  duplicate claims impossible.
- `claimedAmount` is written before the payout (checks-effects-interactions) and
  a reentrancy guard protects native payouts.
- Partial claims are expected: each claim pays everything vested so far.

## 5. Funding

- **Native BOT:** `msg.value` must equal the exact sum of the batch. One wei over
  or under reverts with `IncorrectFunding`.
- **ERC-20:** the manager measures its balance before and after
  `transferFrom`, and requires the delta to equal the exact sum. Fee-on-transfer
  tokens are therefore rejected rather than creating an unfunded liability.
- `totalFunded[asset]` and `totalClaimed[asset]` make the exact funding position
  publicly verifiable. `unclaimedLiability(asset) = totalFunded - totalClaimed`.
- The contract has no owner, no sweep, no revocation, no upgrade proxy and no
  admin withdrawal. Reviewers can verify that native balance >= liability for
  every asset, and that it reaches zero only through beneficiary claims.

## 6. Frontend integration rules

1. Import `vestedAmount` / `claimableAmount` from `shared/vesting.ts`. Do not
   reimplement the formula in a component, hook or server route.
2. Convert every on-chain number to `bigint` before computing. Format only at the
   display edge (`formatUnits`), never before.
3. Treat the contract as the source of truth for confirmation: after a claim,
   display the amount from the `Claimed` event, not a locally recomputed value.
4. The parity test `test/formula-parity.test.ts` compares this module against the
   deployed bytecode across 200 randomized schedules, cliff/end boundary ±1s,
   real schedules created through the manager, and actual payouts. Any change to
   either formula must keep that test green.

## 7. Explicitly out of scope

Revocation, admin withdrawal, pause, upgrades, transferability of the schedule
itself as an NFT, vesting acceleration, and any additional financial mechanism.
Beneficiary transfer moves the claim right; it does not mint a tradable asset.

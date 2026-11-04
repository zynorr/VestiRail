/**
 * Canonical vesting formula for the BOT vesting frontend.
 *
 * This file mirrors `contracts/libraries/VestingMath.sol` line for line and is
 * the ONLY place the frontend may compute a vested or claimable amount. Do not
 * reimplement this arithmetic in a component, hook or API route.
 *
 * Semantics (cliff + linear from start):
 *   - nothing before `start`
 *   - nothing before `start + cliffDuration`
 *   - linear from `start` to `start + duration` once the cliff is reached
 *   - everything at and after `start + duration`
 *   - integer division floors, exactly like EVM `div` (BigInt division in JS also
 *     truncates toward zero for non-negative values)
 *
 * A parity test (`test/formula-parity.test.ts`) proves this module and the
 * deployed bytecode agree, including at boundary timestamps.
 */

export interface VestingTerms {
  /** Total allocation in token base units (wei for native BOT). */
  totalAmount: bigint;
  /** Unix timestamp (seconds) at which accrual begins. */
  start: bigint;
  /** Seconds after `start` before anything can be claimed. */
  cliffDuration: bigint;
  /** Total vesting length in seconds, measured from `start`. */
  duration: bigint;
}

/**
 * Amount vested at `timestamp` for the given terms.
 *
 * @param terms Schedule terms, all in base units / seconds.
 * @param timestamp Unix seconds to evaluate the curve at.
 */
export function vestedAmount(terms: VestingTerms, timestamp: bigint): bigint {
  const { totalAmount, start, cliffDuration, duration } = terms;

  if (duration === 0n) return 0n;

  if (timestamp < start + cliffDuration) return 0n;

  const end = start + duration;
  if (timestamp >= end) return totalAmount;

  return (totalAmount * (timestamp - start)) / duration;
}

/** Amount claimable now: vested at `timestamp` minus what was already claimed. */
export function claimableAmount(
  terms: VestingTerms,
  claimedAmount: bigint,
  timestamp: bigint,
): bigint {
  return vestedAmount(terms, timestamp) - claimedAmount;
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VestingMath
/// @notice The single on-chain definition of the vesting curve.
/// @dev This is mirrored line-for-line by `shared/vesting.ts`, which is the only
///      formula the frontend is allowed to import. See docs/VESTING_SPEC.md.
///
///      Semantics (cliff + linear from start):
///        - Nothing is vested before `start`.
///        - Nothing is vested before `start + cliffDuration`.
///        - From the cliff onward the curve is linear between `start` and
///          `start + duration`; the cliff gates the first claim, it does not move
///          the accrual origin.
///        - At or after `start + duration` everything is vested.
///        - All division floors (truncates toward zero), identically to BigInt
///          division in JavaScript.
///
///      Overflow: the manager stores `totalAmount` as uint128 and `duration` as
///      uint64, so `totalAmount * (timestamp - start) < 2^192`.
library VestingMath {
    /// @notice Amount vested at `timestamp` for a schedule of `totalAmount`.
    /// @param totalAmount Total allocation of the schedule, in token base units.
    /// @param start Unix timestamp at which vesting accrual begins.
    /// @param cliffDuration Seconds after `start` before anything vests.
    /// @param duration Total vesting length in seconds, measured from `start`.
    /// @param timestamp Timestamp to evaluate the curve at.
    function vestedAmount(
        uint256 totalAmount,
        uint64 start,
        uint64 cliffDuration,
        uint64 duration,
        uint256 timestamp
    ) internal pure returns (uint256) {
        if (duration == 0) return 0;

        uint256 startTime = uint256(start);

        // Cliff gate: nothing before `start + cliffDuration`.
        if (timestamp < startTime + uint256(cliffDuration)) return 0;

        uint256 endTime = startTime + uint256(duration);

        // Fully vested at and after the end.
        if (timestamp >= endTime) return totalAmount;

        // Linear from `start` to `start + duration`, floored.
        return (totalAmount * (timestamp - startTime)) / uint256(duration);
    }
}

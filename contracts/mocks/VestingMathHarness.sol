// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VestingMath} from "../libraries/VestingMath.sol";

/// @notice Exposes the internal vesting library so tests can compare it against
///         the shared frontend formula for arbitrary inputs.
contract VestingMathHarness {
    function vested(
        uint256 totalAmount,
        uint64 start,
        uint64 cliffDuration,
        uint64 duration,
        uint256 timestamp
    ) external pure returns (uint256) {
        return VestingMath.vestedAmount(totalAmount, start, cliffDuration, duration, timestamp);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VestingManager} from "../VestingManager.sol";

/// @notice Beneficiary that attempts to re-enter `claim` while receiving its
///         native BOT payout. Used to prove the reentrancy guard holds.
contract ReentrantBeneficiary {
    VestingManager public immutable manager;
    uint256 public scheduleId;

    uint256 public reentryAttempts;
    bytes4 public reentryRevertSelector;
    uint256 public received;

    constructor(VestingManager manager_) {
        manager = manager_;
    }

    function setSchedule(uint256 scheduleId_) external {
        scheduleId = scheduleId_;
    }

    /// @notice Call this to claim as the beneficiary.
    function claimAsBeneficiary() external {
        manager.claim(scheduleId);
    }

    receive() external payable {
        received += msg.value;

        if (reentryAttempts == 0) {
            reentryAttempts = 1;
            try manager.claim(scheduleId) {
                // Should never succeed.
            } catch (bytes memory reason) {
                if (reason.length >= 4) {
                    bytes4 selector;
                    assembly {
                        selector := mload(add(reason, 0x20))
                    }
                    reentryRevertSelector = selector;
                }
            }
        }
    }
}

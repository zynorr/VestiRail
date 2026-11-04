// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockERC20} from "./MockERC20.sol";

/// @notice ERC-20 that burns a fee on every transfer. Used to prove the manager
///         rejects funding that does not arrive in full.
contract FeeOnTransferERC20 is MockERC20 {
    uint256 public immutable feeBps;

    constructor(uint256 feeBps_) MockERC20("Fee On Transfer", "FEE") {
        feeBps = feeBps_;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        uint256 fee = (amount * feeBps) / 10_000;
        super._transfer(from, to, amount - fee);
        if (fee > 0) {
            // Burn the fee by sending it to a holder address that never spends.
            super._transfer(from, address(0x000000000000000000000000000000000000dEaD), fee);
        }
    }
}

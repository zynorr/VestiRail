// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VestingMath} from "./libraries/VestingMath.sol";

/// @notice Minimal ERC-20 surface. Return values are optional at the call site
///         so that non-standard tokens (e.g. tokens returning no data) work.
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title VestingManager
/// @notice Cliff + linear vesting for native BOT and ERC-20 tokens.
/// @dev Deliberately has no owner, no revocation, no upgrade path, no sweep and
///      no admin withdrawal. Once a schedule is funded it can only ever be
///      claimed by that schedule's beneficiary.
///
///      Funding is exact: a creation call must transfer the precise sum of the
///      schedules it creates, and ERC-20 funding is verified by measuring the
///      contract's balance delta (fee-on-transfer tokens are rejected).
contract VestingManager {
    /// @notice Maximum number of schedules that may be created in one call.
    uint256 public constant MAX_BATCH_SIZE = 25;

    /// @notice Native BOT is represented by address(0).
    address private constant _NATIVE = address(0);

    struct ScheduleInput {
        address beneficiary;
        uint64 start;
        uint64 cliffDuration;
        uint64 duration;
        uint128 totalAmount;
    }

    struct Schedule {
        address beneficiary;
        address token;
        uint64 start;
        uint64 cliffDuration;
        uint64 duration;
        uint128 totalAmount;
        uint128 claimedAmount;
    }

    /// @notice Next schedule id to be assigned. Ids start at 1; 0 is invalid.
    uint256 public nextScheduleId = 1;

    mapping(uint256 => Schedule) private _schedules;
    mapping(address => uint256[]) private _beneficiaryScheduleIds;

    /// @notice Total amount ever funded per asset (address(0) == native BOT).
    mapping(address => uint256) public totalFunded;

    /// @notice Total amount ever claimed per asset (address(0) == native BOT).
    mapping(address => uint256) public totalClaimed;

    uint256 private _reentrancyStatus = 1;

    event SchedulesCreated(
        address indexed funder,
        address indexed token,
        uint256 firstScheduleId,
        uint256 scheduleCount,
        uint256 totalAmount
    );
    event Claimed(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        address indexed token,
        uint256 amount
    );
    event BeneficiaryTransferred(
        uint256 indexed scheduleId,
        address indexed previousBeneficiary,
        address indexed newBeneficiary
    );

    error InvalidBatchSize(uint256 count);
    error InvalidBeneficiary(address beneficiary);
    error InvalidAmount();
    error InvalidDuration();
    error InvalidCliff(uint64 cliffDuration, uint64 duration);
    error IncorrectFunding(uint256 required, uint256 received);
    error InvalidToken();
    error UnknownSchedule(uint256 scheduleId);
    error NotBeneficiary(address caller, uint256 scheduleId);
    error NothingToClaim(uint256 scheduleId);
    error SameBeneficiary(address beneficiary);
    error NativeTransferFailed(address to, uint256 amount);
    error TokenTransferFailed(address token, address to, uint256 amount);
    error Reentrancy();

    modifier nonReentrant() {
        if (_reentrancyStatus != 1) revert Reentrancy();
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    // ---------------------------------------------------------------------
    // Schedule creation
    // ---------------------------------------------------------------------

    /// @notice Create native BOT schedules. `msg.value` must equal the exact sum
    ///         of the schedule amounts: no under-funding, no over-funding.
    /// @return ids The ids of the created schedules, in input order.
    function createNativeSchedules(
        ScheduleInput[] calldata inputs
    ) external payable nonReentrant returns (uint256[] memory ids) {
        uint256 required = _validateBatch(inputs);
        if (msg.value != required) revert IncorrectFunding(required, msg.value);
        ids = _createSchedules(inputs, _NATIVE, required);
    }

    /// @notice Create ERC-20 schedules. The contract must receive exactly the sum
    ///         of the schedule amounts, measured as a balance delta.
    /// @param token The ERC-20 token to vest.
    /// @param inputs Schedule definitions.
    /// @return ids The ids of the created schedules, in input order.
    function createTokenSchedules(
        address token,
        ScheduleInput[] calldata inputs
    ) external nonReentrant returns (uint256[] memory ids) {
        if (token == _NATIVE) revert InvalidToken();

        uint256 required = _validateBatch(inputs);

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        _safeTransferFrom(token, msg.sender, address(this), required);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;
        if (received != required) revert IncorrectFunding(required, received);

        ids = _createSchedules(inputs, token, required);
    }

    function _validateBatch(
        ScheduleInput[] calldata inputs
    ) private pure returns (uint256 total) {
        uint256 count = inputs.length;
        if (count == 0 || count > MAX_BATCH_SIZE) revert InvalidBatchSize(count);

        for (uint256 i; i < count; ++i) {
            ScheduleInput calldata input = inputs[i];

            if (input.beneficiary == address(0)) revert InvalidBeneficiary(address(0));
            if (input.totalAmount == 0) revert InvalidAmount();
            if (input.duration == 0) revert InvalidDuration();
            if (input.cliffDuration > input.duration) {
                revert InvalidCliff(input.cliffDuration, input.duration);
            }

            total += input.totalAmount;
        }
    }

    function _createSchedules(
        ScheduleInput[] calldata inputs,
        address token,
        uint256 total
    ) private returns (uint256[] memory ids) {
        uint256 count = inputs.length;
        ids = new uint256[](count);

        uint256 id = nextScheduleId;
        uint256 firstId = id;

        for (uint256 i; i < count; ++i) {
            ScheduleInput calldata input = inputs[i];
            Schedule storage schedule = _schedules[id];

            schedule.beneficiary = input.beneficiary;
            schedule.token = token;
            schedule.start = input.start;
            schedule.cliffDuration = input.cliffDuration;
            schedule.duration = input.duration;
            schedule.totalAmount = input.totalAmount;

            _beneficiaryScheduleIds[input.beneficiary].push(id);
            ids[i] = id;

            unchecked {
                ++id;
            }
        }

        nextScheduleId = id;
        totalFunded[token] += total;

        emit SchedulesCreated(msg.sender, token, firstId, count, total);
    }

    // ---------------------------------------------------------------------
    // Claims
    // ---------------------------------------------------------------------

    /// @notice Claim everything vested and not yet claimed for `scheduleId`.
    /// @dev Reverts with `NothingToClaim` before the cliff, and again once the
    ///      schedule has been fully claimed, which makes duplicate claims
    ///      impossible. State is updated before any value leaves the contract.
    /// @return amount The amount paid out.
    function claim(uint256 scheduleId) external nonReentrant returns (uint256 amount) {
        Schedule storage schedule = _requireSchedule(scheduleId);

        if (msg.sender != schedule.beneficiary) {
            revert NotBeneficiary(msg.sender, scheduleId);
        }

        uint256 vested = VestingMath.vestedAmount(
            schedule.totalAmount,
            schedule.start,
            schedule.cliffDuration,
            schedule.duration,
            block.timestamp
        );

        // `vested` is monotonically non-decreasing and never exceeds
        // `totalAmount`, so this subtraction cannot underflow.
        amount = vested - schedule.claimedAmount;
        if (amount == 0) revert NothingToClaim(scheduleId);

        schedule.claimedAmount = uint128(schedule.claimedAmount + amount);

        address token = schedule.token;
        address beneficiary = schedule.beneficiary;
        totalClaimed[token] += amount;

        emit Claimed(scheduleId, beneficiary, token, amount);

        _payout(token, beneficiary, amount);
    }

    // ---------------------------------------------------------------------
    // Beneficiary transfer
    // ---------------------------------------------------------------------

    /// @notice Move a schedule to a new beneficiary. The full remaining vesting
    ///         position (already vested but unclaimed, plus future accrual)
    ///         transfers with it.
    function transferBeneficiary(uint256 scheduleId, address newBeneficiary) external {
        Schedule storage schedule = _requireSchedule(scheduleId);

        if (msg.sender != schedule.beneficiary) {
            revert NotBeneficiary(msg.sender, scheduleId);
        }
        if (newBeneficiary == address(0)) revert InvalidBeneficiary(address(0));
        if (newBeneficiary == schedule.beneficiary) revert SameBeneficiary(newBeneficiary);

        address previousBeneficiary = schedule.beneficiary;
        schedule.beneficiary = newBeneficiary;

        _beneficiaryScheduleIds[newBeneficiary].push(scheduleId);
        _removeScheduleIdFrom(_beneficiaryScheduleIds[previousBeneficiary], scheduleId);

        emit BeneficiaryTransferred(scheduleId, previousBeneficiary, newBeneficiary);
    }

    function _removeScheduleIdFrom(uint256[] storage list, uint256 scheduleId) private {
        uint256 length = list.length;
        for (uint256 i; i < length; ++i) {
            if (list[i] == scheduleId) {
                list[i] = list[length - 1];
                list.pop();
                return;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Full schedule record.
    function getSchedule(uint256 scheduleId) external view returns (Schedule memory) {
        return _requireSchedule(scheduleId);
    }

    /// @notice Amount vested at an explicit timestamp (pure curve evaluation).
    function vestedAmount(uint256 scheduleId, uint256 timestamp) external view returns (uint256) {
        Schedule storage schedule = _requireSchedule(scheduleId);
        return
            VestingMath.vestedAmount(
                schedule.totalAmount,
                schedule.start,
                schedule.cliffDuration,
                schedule.duration,
                timestamp
            );
    }

    /// @notice Amount claimable right now (vested minus already claimed).
    function claimableAmount(uint256 scheduleId) external view returns (uint256) {
        Schedule storage schedule = _requireSchedule(scheduleId);
        uint256 vested = VestingMath.vestedAmount(
            schedule.totalAmount,
            schedule.start,
            schedule.cliffDuration,
            schedule.duration,
            block.timestamp
        );
        return vested - schedule.claimedAmount;
    }

    /// @notice Schedule ids ever assigned to `beneficiary`, including claimed ones.
    function beneficiaryScheduleIds(address beneficiary) external view returns (uint256[] memory) {
        return _beneficiaryScheduleIds[beneficiary];
    }

    /// @notice Funded minus claimed; the amount the contract still owes for `token`.
    function unclaimedLiability(address token) external view returns (uint256) {
        return totalFunded[token] - totalClaimed[token];
    }

    function _requireSchedule(
        uint256 scheduleId
    ) private view returns (Schedule storage schedule) {
        if (scheduleId == 0 || scheduleId >= nextScheduleId) revert UnknownSchedule(scheduleId);
        return _schedules[scheduleId];
    }

    // ---------------------------------------------------------------------
    // Transfers
    // ---------------------------------------------------------------------

    function _payout(address token, address to, uint256 amount) private {
        if (token == _NATIVE) {
            (bool success, ) = payable(to).call{value: amount}("");
            if (!success) revert NativeTransferFailed(to, amount);
        } else {
            _safeTransfer(token, to, amount);
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory returndata) = token.call(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );
        _checkTransferResult(success, returndata, token, to, amount);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory returndata) = token.call(
            abi.encodeCall(IERC20.transferFrom, (from, to, amount))
        );
        _checkTransferResult(success, returndata, token, to, amount);
    }

    function _checkTransferResult(
        bool success,
        bytes memory returndata,
        address token,
        address to,
        uint256 amount
    ) private pure {
        if (!success) {
            // Bubble the token's own revert reason when it provided one.
            if (returndata.length > 0) {
                assembly {
                    revert(add(returndata, 0x20), mload(returndata))
                }
            }
            revert TokenTransferFailed(token, to, amount);
        }
        if (returndata.length > 0) {
            if (returndata.length < 32 || !abi.decode(returndata, (bool))) {
                revert TokenTransferFailed(token, to, amount);
            }
        }
    }
}

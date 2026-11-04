import type { InterfaceAbi } from "ethers";

// Generated from artifacts/contracts/VestingManager.sol/VestingManager.json.
export const vestingManagerAbi = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "MAX_BATCH_SIZE",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "beneficiaryScheduleIds",
    inputs: [{ name: "beneficiary", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claim",
    inputs: [{ name: "scheduleId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "amount", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimableAmount",
    inputs: [{ name: "scheduleId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createNativeSchedules",
    inputs: [
      {
        name: "inputs",
        type: "tuple[]",
        internalType: "struct VestingManager.ScheduleInput[]",
        components: [
          { name: "beneficiary", type: "address", internalType: "address" },
          { name: "start", type: "uint64", internalType: "uint64" },
          { name: "cliffDuration", type: "uint64", internalType: "uint64" },
          { name: "duration", type: "uint64", internalType: "uint64" },
          { name: "totalAmount", type: "uint128", internalType: "uint128" },
        ],
      },
    ],
    outputs: [{ name: "ids", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "createTokenSchedules",
    inputs: [
      { name: "token", type: "address", internalType: "address" },
      {
        name: "inputs",
        type: "tuple[]",
        internalType: "struct VestingManager.ScheduleInput[]",
        components: [
          { name: "beneficiary", type: "address", internalType: "address" },
          { name: "start", type: "uint64", internalType: "uint64" },
          { name: "cliffDuration", type: "uint64", internalType: "uint64" },
          { name: "duration", type: "uint64", internalType: "uint64" },
          { name: "totalAmount", type: "uint128", internalType: "uint128" },
        ],
      },
    ],
    outputs: [{ name: "ids", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getSchedule",
    inputs: [{ name: "scheduleId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct VestingManager.Schedule",
        components: [
          { name: "beneficiary", type: "address", internalType: "address" },
          { name: "token", type: "address", internalType: "address" },
          { name: "start", type: "uint64", internalType: "uint64" },
          { name: "cliffDuration", type: "uint64", internalType: "uint64" },
          { name: "duration", type: "uint64", internalType: "uint64" },
          { name: "totalAmount", type: "uint128", internalType: "uint128" },
          { name: "claimedAmount", type: "uint128", internalType: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextScheduleId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalClaimed",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalFunded",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "unclaimedLiability",
    inputs: [{ name: "token", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "vestedAmount",
    inputs: [
      { name: "scheduleId", type: "uint256", internalType: "uint256" },
      { name: "timestamp", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "SchedulesCreated",
    inputs: [
      { name: "funder", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: true, internalType: "address" },
      {
        name: "firstScheduleId",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      { name: "scheduleCount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "totalAmount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "scheduleId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "beneficiary", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BeneficiaryTransferred",
    inputs: [
      { name: "scheduleId", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "previousBeneficiary",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      { name: "newBeneficiary", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
] as InterfaceAbi;

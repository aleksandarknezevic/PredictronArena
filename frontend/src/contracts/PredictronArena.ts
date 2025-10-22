// PredictronArena Contract Integration
export const PREDICTRON_ARENA_ADDRESS = "0xe62Fcb22480950aA6c9f49Dc1057752e1aDd52c2";

// Contract ABI - Essential functions only
export const PREDICTRON_ARENA_ABI = [
  // Events
  "event BetPlaced(uint256 indexed roundId, address indexed user, uint256 amount, uint8 side)",
  "event RoundStarted(uint256 indexed roundId, uint256 startTs, int256 startPrice)",
  "event RoundEnded(uint256 indexed roundId, uint256 endTs, int256 endPrice, uint8 result)",
  "event RewardClaimed(uint256 indexed roundId, address indexed user, uint256 amount)",
  "event ExternalPredictionAdded(uint256 indexed roundId, uint8 aiPrediction)",

  // Read functions
  "function getCurrentRound() external view returns (tuple(uint256 id, uint256 startTs, uint256 endTs, int256 startPrice, int256 endPrice, uint256 totalUp, uint256 totalDown, uint8 winningSide))",
  "function getRound(uint256 _roundId) external view returns (tuple(uint256 id, uint256 startTs, uint256 endTs, int256 startPrice, int256 endPrice, uint256 totalUp, uint256 totalDown, uint8 winningSide))",
  "function currentRoundId() external view returns (uint256)",
  "function nextRoundId() external view returns (uint256)",
  "function calculateReward(uint256 roundId, address user) external view returns (uint256)",
  "function userBetsByRound(uint256 roundId, address user) external view returns (tuple(uint256 upAmount, uint256 downAmount))",
  "function hasClaimed(uint256 roundId, address user) external view returns (bool)",
  "function getLatestPrice() external view returns (int256)",
  "function MIN_BET() external view returns (uint256)",

  // Write functions
  "function placeBet(uint8 side) external payable",
  "function claim(uint256 roundId) external",
];

// Enums
export const Side = {
  None: 0,
  Up: 1,
  Down: 2,
} as const;

export type Side = typeof Side[keyof typeof Side];

// Types
export interface Round {
  id: bigint;
  startTs: bigint;
  endTs: bigint;
  startPrice: bigint;
  endPrice: bigint;
  totalUp: bigint;
  totalDown: bigint;
  winningSide: Side;
}

export interface UserBet {
  upAmount: bigint;
  downAmount: bigint;
}

export interface BetPlacedEvent {
  roundId: bigint;
  user: string;
  amount: bigint;
  side: Side;
}

export interface RoundEndedEvent {
  roundId: bigint;
  endTs: bigint;
  endPrice: bigint;
  result: Side;
}

// Constants
export const MIN_BET_WEI = BigInt("5000000000000000"); // 0.005 ETH
export const SEPOLIA_CHAIN_ID = 11155111;
export const ROUND_INTERVAL = 3300; // seconds (55 minutes)

// Generated types based on your GraphQL schema
export interface UserStats {
  id: string;
  chainId: number;
  user: string;
  roundsPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  totalBet: string; // BigInt as string
  totalGrossRewards: string; // BigInt as string
  totalNetPnl: string; // BigInt as string
  winRate: number;
}

export interface AiStats {
  id: string;
  chainId: number;
  roundsWithPrediction: number;
  correct: number;
  incorrect: number;
  pushes: number;
  accuracy: number;
}

export interface UserRound {
  id: string;
  chainId: number;
  roundId: string; // BigInt as string
  user: string;
  upAmount: string; // BigInt as string
  downAmount: string; // BigInt as string
  totalBet: string; // BigInt as string
  side?: number; // 1 = Up, 2 = Down
  grossReward: string; // BigInt as string
  netPnl: string; // BigInt as string
  won: boolean;
  claimed: boolean;
}

export interface Round {
  id: string;
  chainId: number;
  roundId: string; // BigInt as string
  startTs?: string; // BigInt as string
  endTs?: string; // BigInt as string
  startPrice?: string; // BigInt as string
  endPrice?: string; // BigInt as string
  aiPrediction?: number; // 1 = Up, 2 = Down, 0/undefined = None
  result?: number; // 1 = Up, 2 = Down, 0 = None
  totalUp: string; // BigInt as string
  totalDown: string; // BigInt as string
  protocolFeeBps: number;
  protocolFeePrecision: string; // BigInt as string
}

export interface LeaderboardRow {
  id: string;
  chainId: number;
  user: string;
  totalNetPnl: string; // BigInt as string
  winRate: number;
  roundsPlayed: number;
}

// Query result types
export interface GetUserStatsData {
  UserStats: UserStats[];
}

export interface GetAiStatsData {
  AiStats: AiStats[];
}

export interface GetUserRoundsData {
  UserRound: UserRound[];
}

export interface GetRoundsData {
  Round: Round[];
}

export interface GetLatestRoundsData {
  Round: Round[];
}

export interface GetLeaderboardData {
  LeaderboardRow: LeaderboardRow[];
}

export interface GetUserBettingHistoryData {
  UserRound: UserRound[];
}

export interface GetRoundsByIdsData {
  Round: Round[];
}

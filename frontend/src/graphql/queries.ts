import { gql } from '@apollo/client';

// Get user stats for a specific user address
export const GET_USER_STATS = gql`
  query GetUserStats($user: String!, $chainId: Int!) {
    UserStats(where: { user: { _ilike: $user }, chainId: { _eq: $chainId } }) {
      id
      chainId
      user
      roundsPlayed
      wins
      losses
      pushes
      totalBet
      totalGrossRewards
      totalNetPnl
      winRate
    }
  }
`;

// Get AI stats for a specific chain
export const GET_AI_STATS = gql`
  query GetAiStats($chainId: String!) {
    AiStats(where: { id: { _eq: $chainId } }) {
      id
      chainId
      roundsWithPrediction
      correct
      incorrect
      pushes
      accuracy
    }
  }
`;

// Get user's betting history
export const GET_USER_ROUNDS = gql`
  query GetUserRounds($userId: String!, $chainId: Int!, $first: Int = 20) {
    userRounds(
      where: { user: $userId, chainId: $chainId }
      orderBy: roundId
      orderDirection: desc
      first: $first
    ) {
      id
      chainId
      roundId
      user
      upAmount
      downAmount
      totalBet
      side
      grossReward
      netPnl
      won
      claimed
    }
  }
`;

// Get round details for user rounds
export const GET_ROUNDS = gql`
  query GetRounds($roundIds: [ID!]!) {
    rounds(where: { id_in: $roundIds }) {
      id
      chainId
      roundId
      startTs
      endTs
      startPrice
      endPrice
      aiPrediction
      result
      totalUp
      totalDown
      protocolFeeBps
      protocolFeePrecision
    }
  }
`;

// Get current/latest round
export const GET_LATEST_ROUNDS = gql`
  query GetLatestRounds($chainId: Int!, $first: Int = 5) {
    Round(
      where: { chainId: { _eq: $chainId } }
      order_by: { roundId: desc }
      limit: $first
    ) {
      id
      chainId
      roundId
      startTs
      endTs
      startPrice
      endPrice
      aiPrediction
      result
      totalUp
      totalDown
      protocolFeeBps
      protocolFeePrecision
    }
  }
`;

// Get leaderboard
export const GET_LEADERBOARD = gql`
  query GetLeaderboard($chainId: Int!, $limit: Int = 100) {
    LeaderboardRow(
      where: { chainId: { _eq: $chainId } }
      order_by: { totalNetPnl: desc }
      limit: $limit
    ) {
      id
      chainId
      user
      totalNetPnl
      winRate
      roundsPlayed
    }
  }
`;

// Get user rounds with round details
export const GET_USER_BETTING_HISTORY = gql`
  query GetUserBettingHistory($user: String!, $chainId: Int!, $first: Int = 20) {
    UserRound(
      where: { user: { _ilike: $user }, chainId: { _eq: $chainId } }
      order_by: { roundId: desc }
      limit: $first
    ) {
      id
      chainId
      roundId
      user
      upAmount
      downAmount
      totalBet
      side
      grossReward
      netPnl
      won
      claimed
    }
  }
`;

// Get round details by IDs
export const GET_ROUNDS_BY_IDS = gql`
  query GetRoundsByIds($roundIds: [numeric!]!) {
    Round(where: { roundId: { _in: $roundIds } }) {
      id
      chainId
      roundId
      startTs
      endTs
      startPrice
      endPrice
      aiPrediction
      result
      totalUp
      totalDown
      protocolFeeBps
      protocolFeePrecision
    }
  }
`;

// Get all rounds for analytics (limited to recent rounds)
export const GET_ALL_ROUNDS = gql`
  query GetAllRounds($chainId: Int!, $limit: Int = 100) {
    Round(
      where: { chainId: { _eq: $chainId }, endTs: { _gt: "0" } }
      order_by: { roundId: desc }
      limit: $limit
    ) {
      id
      chainId
      roundId
      startTs
      endTs
      startPrice
      endPrice
      aiPrediction
      result
      totalUp
      totalDown
      protocolFeeBps
      protocolFeePrecision
      participants
    }
  }
`;

// Get protocol analytics
export const GET_PROTOCOL_ANALYTICS = gql`
  query GetProtocolAnalytics($chainId: Int!) {
    Round(
      where: { chainId: { _eq: $chainId } }
      order_by: { roundId: asc }
    ) {
      id
      roundId
      startTs
      endTs
      totalUp
      totalDown
      result
      aiPrediction
    }
  }
`;

// Get recent bet activity across all users
export const GET_RECENT_ACTIVITY = gql`
  query GetRecentActivity($chainId: Int!, $limit: Int = 20) {
    UserRound(
      where: { chainId: { _eq: $chainId } }
      order_by: { roundId: desc }
      limit: $limit
    ) {
      id
      user
      roundId
      upAmount
      downAmount
      totalBet
      side
    }
  }
`;

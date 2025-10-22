import React, { useState, useEffect } from 'react';
import apolloClient from '../graphql/client';
import { useWeb3 } from '../contexts/Web3Context';
import { 
  Brain, 
  TrendingUp, 
  Trophy, 
  Target, 
  Users, 
  Zap,
  BarChart3,
  Crown,
  Medal,
  Award,
  Bot,
  AlertCircle
} from 'lucide-react';
import { SEPOLIA_CHAIN_ID } from '../contracts/PredictronArena';
import { ethers } from 'ethers';
import { GET_USER_STATS, GET_AI_STATS, GET_LEADERBOARD } from '../graphql/queries';
import type { GetUserStatsData, GetAiStatsData, GetLeaderboardData, UserStats, AiStats } from '../graphql/types';

export const StatsTab: React.FC = () => {
  const { account, chainId, isConnected } = useWeb3();
  
  // State for data
  const [userStatsData, setUserStatsData] = useState<GetUserStatsData | null>(null);
  const [aiStatsData, setAiStatsData] = useState<GetAiStatsData | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<GetLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState<string | null>(null);

  // Generate user ID for GraphQL queries
  const userId = account ? `${SEPOLIA_CHAIN_ID}_${account.toLowerCase()}` : '';
  const aiStatsId = SEPOLIA_CHAIN_ID.toString();

  // Fetch data function
  const fetchData = async () => {
    if (!account || !isConnected || chainId !== SEPOLIA_CHAIN_ID) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setHasError(null);

      // Fetch user stats
      const userStatsResult = await apolloClient.query<GetUserStatsData>({
        query: GET_USER_STATS,
        variables: { 
          user: account.toLowerCase(),
          chainId: SEPOLIA_CHAIN_ID 
        },
        fetchPolicy: 'network-only',
      });

      // Fetch AI stats
      const aiStatsResult = await apolloClient.query<GetAiStatsData>({
        query: GET_AI_STATS,
        variables: { chainId: aiStatsId },
        fetchPolicy: 'network-only',
      });

      // Fetch leaderboard
      const leaderboardResult = await apolloClient.query<GetLeaderboardData>({
        query: GET_LEADERBOARD,
        variables: { chainId: SEPOLIA_CHAIN_ID, limit: 10 },
        fetchPolicy: 'network-only',
      });

      setUserStatsData(userStatsResult.data || null);
      setAiStatsData(aiStatsResult.data || null);
      setLeaderboardData(leaderboardResult.data || null);
    } catch (error: any) {
      console.error('Error fetching stats:', error);
      setHasError(error.message || 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on mount and when dependencies change
  useEffect(() => {
    fetchData();
  }, [account, chainId, isConnected, userId]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    if (!account || !isConnected || chainId !== SEPOLIA_CHAIN_ID) return;

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [account, chainId, isConnected]);

  const formatEther = (weiString: string) => {
    return parseFloat(ethers.formatEther(weiString)).toFixed(3);
  };

  // Calculate win rate based on backend winRate field (stored as decimal 0-1)
  const calculateWinRate = (userStats: UserStats | null): number => {
    if (!userStats) return 0;
    
    // Backend stores winRate as decimal (0-1), convert to percentage
    return Math.round(userStats.winRate * 100);
  };

  // Calculate AI accuracy from backend accuracy field (stored as decimal 0-1)
  const calculateAiAccuracy = (aiStats: AiStats | null): number => {
    if (!aiStats || !aiStats.accuracy) return 0;
    return aiStats.accuracy * 100;
  };

  const formatAddress = (address: string) => {
    if (address.toLowerCase() === account?.toLowerCase()) return 'You';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getNetPnlColor = (pnlString: string) => {
    const pnl = BigInt(pnlString);
    if (pnl > 0n) return 'text-green-400';
    if (pnl < 0n) return 'text-red-400';
    return 'text-gray-400';
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Crown className="w-5 h-5 text-yellow-400" />;
      case 1: return <Medal className="w-5 h-5 text-gray-400" />;
      case 2: return <Award className="w-5 h-5 text-amber-600" />;
      default: return <span className="text-gray-400 font-bold">#{index + 1}</span>;
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-16 h-16 text-indigo-400 mx-auto mb-4 animate-pulse" />
        <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400">Connect to view statistics and leaderboard</p>
      </div>
    );
  }

  if (chainId !== SEPOLIA_CHAIN_ID) {
    return (
      <div className="text-center py-12">
        <Zap className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Wrong Network</h3>
        <p className="text-gray-400">Please switch to Sepolia testnet</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-400 border-t-transparent mx-auto mb-4"></div>
        <h3 className="text-xl font-semibold text-white mb-2">Loading Statistics...</h3>
        <p className="text-gray-400">Fetching data from backend indexer</p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Error Loading Stats</h3>
        <p className="text-gray-400">Please make sure the backend indexer is running</p>
        <p className="text-red-400 text-sm mt-2">
          {hasError}
        </p>
      </div>
    );
  }

  // Safe access to data
  const userStats = userStatsData?.UserStats?.[0] || null;
  const aiStats = aiStatsData?.AiStats?.[0] || null;
  const leaderboard = leaderboardData?.LeaderboardRow || [];

  return (
    <div className="space-y-4">
      {/* Your Stats */}
      {userStats ? (
        <div className="bg-card glass-card compact-padding rounded-lg border border-gray-700/50">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-indigo-400" />
            Your Performance
          </h2>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center">
              <TrendingUp className="w-8 h-8 text-green-400 mx-auto mb-3" />
              <div className="text-4xl font-bold text-green-400 mb-2">
                {`${calculateWinRate(userStats)}%`}
              </div>
              <div className="text-sm text-gray-300">Win Rate</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-400 mb-2">
                {userStats.roundsPlayed}
              </div>
              <div className="text-sm text-gray-300">Rounds Played</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-400 mb-2">
                {formatEther(userStats.totalBet)}
              </div>
              <div className="text-sm text-gray-300">Total Invested</div>
              <div className="text-xs text-gray-500 mt-1">(All bets placed)</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-400 mb-2">
                {formatEther((BigInt(userStats.totalBet) + BigInt(userStats.totalNetPnl)).toString())}
              </div>
              <div className="text-sm text-gray-300">Total Returned</div>
              <div className="text-xs text-gray-500 mt-1">(Claimed + Claimable)</div>
            </div>
          </div>
          
          {/* Net P&L as a separate prominent stat */}
          <div className="mt-6 pt-6 border-t border-gray-700">
            <div className="text-center">
              <div className={`text-5xl font-bold mb-2 ${getNetPnlColor(userStats.totalNetPnl)}`}>
                {BigInt(userStats.totalNetPnl) >= 0n ? '+' : ''}{formatEther(userStats.totalNetPnl)} ETH
              </div>
              <div className="text-lg text-gray-300 mb-1">Net Profit/Loss</div>
              <div className="text-sm text-gray-400">
                (Returned - Invested = {formatEther((BigInt(userStats.totalBet) + BigInt(userStats.totalNetPnl)).toString())} - {formatEther(userStats.totalBet)})
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-700">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-medium">Wins:</span>
                <span className="text-green-400 font-bold text-lg">{userStats.wins}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-medium">Losses:</span>
                <span className="text-red-400 font-bold text-lg">{userStats.losses}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-medium">Pushes:</span>
                <span className="text-yellow-400 font-bold text-lg">{userStats.pushes}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <Target className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <h4 className="text-lg font-semibold text-white mb-2">No Stats Yet</h4>
          <p className="text-gray-400">Place some bets to see your performance stats!</p>
        </div>
      )}

      {/* AI vs Players Comparison */}
      {aiStats && (
        <div className="bg-card glass-card compact-padding rounded-lg border border-purple-700/50">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            AI vs Players
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* AI Stats */}
            <div className="bg-card glass-card compact-padding rounded-lg border border-gray-800/50">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Bot className="w-6 h-6 text-purple-400" />
                AI Performance
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400 mb-1">
                    {aiStats.accuracy ? (aiStats.accuracy * 100).toFixed(1) : '0'}%
                  </div>
                  <div className="text-sm text-gray-400">Accuracy</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400 mb-1">
                    {aiStats.roundsWithPrediction}
                  </div>
                  <div className="text-sm text-gray-400">Total Predictions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400 mb-1">
                    {aiStats.correct}
                  </div>
                  <div className="text-sm text-gray-400">Correct</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-400 mb-1">
                    {aiStats.pushes}
                  </div>
                  <div className="text-sm text-gray-400">Ties</div>
                </div>
              </div>
            </div>

            {/* Your vs AI Comparison */}
            {userStats && (
              <div className="bg-card glass-card compact-padding rounded-lg border border-gray-800/50">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Users className="w-6 h-6 text-green-400" />
                  Your vs AI
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Your Accuracy:</span>
                    <span className="text-green-400 font-bold">{calculateWinRate(userStats)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">AI Accuracy:</span>
                    <span className="text-purple-400 font-bold">
                      {aiStats.accuracy ? (aiStats.accuracy * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Difference:</span>
                    <span className={`font-bold ${
                      calculateWinRate(userStats) > calculateAiAccuracy(aiStats)
                        ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {calculateWinRate(userStats) > calculateAiAccuracy(aiStats) ? '+' : ''}
                      {(calculateWinRate(userStats) - calculateAiAccuracy(aiStats)).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-center mt-4">
                    <div className={`text-lg font-bold ${
                      calculateWinRate(userStats) > calculateAiAccuracy(aiStats)
                        ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {calculateWinRate(userStats) > calculateAiAccuracy(aiStats)
                        ? "You're beating the AI! 🎉" : "AI is ahead 🤖"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard && leaderboard.length > 0 && (
        <div className="bg-card glass-card compact-padding rounded-lg border border-gray-700/50">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Leaderboard
          </h2>
          
          <div className="space-y-2">
            {leaderboard.slice(0, 10).map((player, index) => (
              <div key={player.user} className="flex items-center justify-between bg-card glass-card compact-padding rounded-lg border border-gray-800/50 hover:scale-[1.01] transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 flex items-center justify-center">
                    {getRankIcon(index)}
                  </div>
                  <div>
                    <div className="text-white font-semibold">
                      {formatAddress(player.user)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {player.roundsPlayed} rounds played
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-bold text-lg">
                    {(player.winRate * 100).toFixed(1)}%
                  </div>
                  <div className={`text-sm font-medium ${getNetPnlColor(player.totalNetPnl)}`}>
                    {BigInt(player.totalNetPnl) >= 0n ? '+' : ''}{formatEther(player.totalNetPnl)} ETH
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
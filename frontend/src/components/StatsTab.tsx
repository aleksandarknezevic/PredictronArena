import React, { useState, useEffect } from 'react';
import apolloClient from '../graphql/client';
import { useWeb3 } from '../contexts/Web3Context';
import { useTheme } from '../contexts/ThemeContext';
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
  const { theme } = useTheme();
  
  // Theme-aware colors
  const colors = {
    cardBg: theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' : 'rgba(255, 255, 255, 0.9)',
    cardBorder: theme === 'dark' ? 'rgba(75, 85, 99, 0.5)' : 'rgba(209, 213, 219, 0.8)',
    text: theme === 'dark' ? '#ffffff' : '#111827',
    textSecondary: theme === 'dark' ? '#9ca3af' : '#6b7280',
    iconPrimary: theme === 'dark' ? '#818cf8' : '#6366f1',
  };
  
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
    <div className="space-y-3">
      {/* Your Stats - Compact */}
      {userStats ? (
        <div style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Trophy style={{ width: '1.25rem', height: '1.25rem', color: colors.iconPrimary }} />
            <span style={{ fontSize: '1rem', fontWeight: '700', color: colors.text }}>YOUR PERFORMANCE</span>
          </div>
          
          {/* Main Stats in Single Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <TrendingUp style={{ width: '1.5rem', height: '1.5rem', color: '#22c55e', margin: '0 auto 0.25rem' }} />
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#22c55e' }}>
                {calculateWinRate(userStats)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Win Rate</div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <BarChart3 style={{ width: '1.5rem', height: '1.5rem', color: '#3b82f6', margin: '0 auto 0.25rem' }} />
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#3b82f6' }}>
                {userStats.roundsPlayed}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Rounds</div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <Target style={{ width: '1.5rem', height: '1.5rem', color: '#f97316', margin: '0 auto 0.25rem' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#f97316', fontFamily: 'monospace' }}>
                {formatEther(userStats.totalBet)}
              </div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Invested</div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <Zap style={{ width: '1.5rem', height: '1.5rem', color: '#c084fc', margin: '0 auto 0.25rem' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#c084fc', fontFamily: 'monospace' }}>
                {formatEther((BigInt(userStats.totalBet) + BigInt(userStats.totalNetPnl)).toString())}
              </div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Returned</div>
            </div>
          </div>
          
          {/* Net P&L - Compact */}
          <div style={{ 
            borderTop: `1px solid ${colors.cardBorder}`,
            paddingTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: colors.textSecondary }}>Net P&L:</span>
              <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                ({formatEther((BigInt(userStats.totalBet) + BigInt(userStats.totalNetPnl)).toString())} - {formatEther(userStats.totalBet)})
              </span>
            </div>
            <div style={{ 
              fontSize: '1.75rem', 
              fontWeight: '900', 
              fontFamily: 'monospace',
              color: BigInt(userStats.totalNetPnl) >= 0n ? '#22c55e' : '#ef4444'
            }}>
              {BigInt(userStats.totalNetPnl) >= 0n ? '+' : ''}{formatEther(userStats.totalNetPnl)} ETH
            </div>
          </div>

          {/* Win/Loss/Tie Stats - Single Row */}
          <div style={{ 
            borderTop: `1px solid ${colors.cardBorder}`,
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#22c55e' }}>{userStats.wins}</div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>WINS</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ef4444' }}>{userStats.losses}</div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>LOSSES</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#f59e0b' }}>{userStats.pushes}</div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>TIES</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <Target className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <h4 className="text-lg font-semibold mb-2" style={{ color: colors.text }}>No Stats Yet</h4>
          <p style={{ color: colors.textSecondary }}>Place some bets to see your performance stats!</p>
        </div>
      )}

      {/* AI Stats - Compact */}
      {aiStats && (
        <div style={{
          backgroundColor: colors.cardBg,
          border: theme === 'dark' ? '1px solid rgba(168, 85, 247, 0.4)' : `1px solid ${colors.cardBorder}`,
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Brain style={{ width: '1.25rem', height: '1.25rem', color: '#a855f7' }} />
            <span style={{ fontSize: '1rem', fontWeight: '700', color: colors.text }}>AI PERFORMANCE</span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: userStats ? '2fr 3fr' : '1fr', gap: '1rem' }}>
            {/* AI Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              <div style={{ textAlign: 'center' }}>
                <Bot style={{ width: '1.25rem', height: '1.25rem', color: '#a855f7', margin: '0 auto 0.25rem' }} />
                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#a855f7' }}>
                  {aiStats.accuracy ? (aiStats.accuracy * 100).toFixed(1) : '0'}%
                </div>
                <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Accuracy</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Target style={{ width: '1.25rem', height: '1.25rem', color: '#3b82f6', margin: '0 auto 0.25rem' }} />
                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#3b82f6' }}>
                  {aiStats.roundsWithPrediction}
                </div>
                <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Predictions</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#22c55e' }}>{aiStats.correct}</div>
                <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Correct</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#f59e0b' }}>{aiStats.pushes}</div>
                <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Ties</div>
              </div>
            </div>

            {/* Your vs AI Comparison */}
            {userStats && (
              <div style={{ 
                borderLeft: `1px solid ${colors.cardBorder}`, 
                paddingLeft: '1rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
                  <Users style={{ width: '1rem', height: '1rem', color: '#22c55e' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: colors.textSecondary }}>YOU VS AI</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Your Accuracy:</span>
                  <span style={{ fontSize: '1rem', fontWeight: '700', color: '#22c55e' }}>{calculateWinRate(userStats)}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>AI Accuracy:</span>
                  <span style={{ fontSize: '1rem', fontWeight: '700', color: '#a855f7' }}>
                    {aiStats.accuracy ? (aiStats.accuracy * 100).toFixed(1) : '0'}%
                  </span>
                </div>
                <div style={{ 
                  marginTop: '0.5rem',
                  paddingTop: '0.5rem',
                  borderTop: `1px solid ${colors.cardBorder}`,
                  textAlign: 'center'
                }}>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: '900',
                    color: calculateWinRate(userStats) > calculateAiAccuracy(aiStats) ? '#22c55e' : '#ef4444'
                  }}>
                    {calculateWinRate(userStats) > calculateAiAccuracy(aiStats)
                      ? "🎉 YOU'RE WINNING!" : "🤖 AI IS AHEAD"}
                  </div>
                  <div style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: '900',
                    color: calculateWinRate(userStats) > calculateAiAccuracy(aiStats) ? '#22c55e' : '#ef4444'
                  }}>
                    {calculateWinRate(userStats) > calculateAiAccuracy(aiStats) ? '+' : ''}
                    {(calculateWinRate(userStats) - calculateAiAccuracy(aiStats)).toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard - Compact */}
      {leaderboard && leaderboard.length > 0 && (
        <div style={{
          backgroundColor: colors.cardBg,
          border: theme === 'dark' ? '1px solid rgba(234, 179, 8, 0.4)' : `1px solid ${colors.cardBorder}`,
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Trophy style={{ width: '1.25rem', height: '1.25rem', color: '#f59e0b' }} />
            <span style={{ fontSize: '1rem', fontWeight: '700', color: colors.text }}>LEADERBOARD</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {leaderboard.slice(0, 10).map((player, index) => (
              <div 
                key={player.user} 
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.6)' : 'rgba(243, 244, 246, 0.6)',
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: '0.375rem',
                  padding: '0.625rem 0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(31, 41, 55, 0.8)' : 'rgba(254, 252, 232, 0.8)';
                  e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(234, 179, 8, 0.4)' : '#f59e0b';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(17, 24, 39, 0.6)' : 'rgba(243, 244, 246, 0.6)';
                  e.currentTarget.style.borderColor = colors.cardBorder;
                }}
              >
                {/* Rank & Player */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  <div style={{ width: '2rem', display: 'flex', justifyContent: 'center' }}>
                    {getRankIcon(index)}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '700', color: colors.text }}>
                      {formatAddress(player.user)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>
                      {player.roundsPlayed} rounds
                    </div>
                  </div>
                </div>
                
                {/* Stats */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginBottom: '0.125rem' }}>WIN RATE</div>
                    <div style={{ fontSize: '1rem', fontWeight: '900', color: '#22c55e' }}>
                      {(player.winRate * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '100px' }}>
                    <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginBottom: '0.125rem' }}>NET P&L</div>
                    <div style={{ 
                      fontSize: '1rem', 
                      fontWeight: '900',
                      fontFamily: 'monospace',
                      color: BigInt(player.totalNetPnl) >= 0n ? '#22c55e' : '#ef4444'
                    }}>
                      {BigInt(player.totalNetPnl) >= 0n ? '+' : ''}{formatEther(player.totalNetPnl)} ETH
                    </div>
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
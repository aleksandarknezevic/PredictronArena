import React, { useState, useEffect, useRef } from 'react';
import apolloClient from '../graphql/client';
import { useWeb3 } from '../contexts/Web3Context';
import { useTheme } from '../contexts/ThemeContext';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Gift,
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Brain,
  Target,
  Users,
  Zap,
  BarChart3,
  Crown,
  Medal,
  Award,
  Bot
} from 'lucide-react';
import { Side, SEPOLIA_CHAIN_ID } from '../contracts/PredictronArena';
import { ethers } from 'ethers';
import { 
  GET_USER_BETTING_HISTORY, 
  GET_ROUNDS_BY_IDS,
  GET_USER_STATS,
  GET_AI_STATS,
  GET_LEADERBOARD,
  GET_ALL_ROUNDS
} from '../graphql/queries';
import type { 
  GetUserBettingHistoryData, 
  GetRoundsByIdsData, 
  Round as BackendRound,
  GetUserStatsData,
  GetAiStatsData,
  GetLeaderboardData,
  UserStats,
  AiStats
} from '../graphql/types';

interface BetHistory {
  roundId: string;
  round: BackendRound | null;
  userBet: {
    upAmount: string;
    downAmount: string;
  };
  reward: string;
  claimed: boolean;
  canClaim: boolean;
  won: boolean;
  netPnl: string;
}

export const DashboardTab: React.FC = () => {
  const { contract, account, chainId, isConnected } = useWeb3();
  const { theme } = useTheme();
  
  // Theme-aware colors
  const colors = {
    cardBg: theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' : 'rgba(255, 255, 255, 0.9)',
    cardBorder: theme === 'dark' ? 'rgba(75, 85, 99, 0.5)' : 'rgba(209, 213, 219, 0.8)',
    text: theme === 'dark' ? '#ffffff' : '#111827',
    textSecondary: theme === 'dark' ? '#9ca3af' : '#6b7280',
    iconPrimary: theme === 'dark' ? '#818cf8' : '#6366f1',
  };

  // Bet history state
  const [betHistory, setBetHistory] = useState<BetHistory[]>([]);
  const [claimingRounds, setClaimingRounds] = useState<Set<string>>(new Set());
  const locallyClaimedRef = useRef<Set<string>>(new Set());
  
  // Stats state
  const [userStatsData, setUserStatsData] = useState<GetUserStatsData | null>(null);
  const [aiStatsData, setAiStatsData] = useState<GetAiStatsData | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<GetLeaderboardData | null>(null);
  
  // Global round state
  const [highestEndedRound, setHighestEndedRound] = useState<number>(0);
  
  // Loading state
  const [loading, setLoading] = useState(true);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Reset to page 1 when bet history changes
  useEffect(() => {
    setCurrentPage(1);
  }, [betHistory.length]);

  // Generate AI stats ID for GraphQL queries
  const aiStatsId = SEPOLIA_CHAIN_ID.toString();

  const fetchAllData = async () => {
    if (!account || !isConnected || chainId !== SEPOLIA_CHAIN_ID) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [userRoundsResult, userStatsResult, aiStatsResult, leaderboardResult, allRoundsResult] = await Promise.all([
        // Bet history
        apolloClient.query<GetUserBettingHistoryData>({
          query: GET_USER_BETTING_HISTORY,
          variables: { 
            user: account.toLowerCase(),
            chainId: SEPOLIA_CHAIN_ID,
            first: 1000
          },
          fetchPolicy: 'network-only',
        }),
        // User stats
        apolloClient.query<GetUserStatsData>({
          query: GET_USER_STATS,
          variables: { 
            user: account.toLowerCase(),
            chainId: SEPOLIA_CHAIN_ID 
          },
          fetchPolicy: 'network-only',
        }),
        // AI stats
        apolloClient.query<GetAiStatsData>({
          query: GET_AI_STATS,
          variables: { chainId: aiStatsId },
          fetchPolicy: 'network-only',
        }),
        // Leaderboard
        apolloClient.query<GetLeaderboardData>({
          query: GET_LEADERBOARD,
          variables: { chainId: SEPOLIA_CHAIN_ID, limit: 10 },
          fetchPolicy: 'network-only',
        }),
        // All ended rounds (to get highest ended round globally)
        apolloClient.query({
          query: GET_ALL_ROUNDS,
          variables: { chainId: SEPOLIA_CHAIN_ID, limit: 1 },
          fetchPolicy: 'network-only',
        })
      ]);

      // Set stats data
      setUserStatsData(userStatsResult.data || null);
      setAiStatsData(aiStatsResult.data || null);
      setLeaderboardData(leaderboardResult.data || null);

      // Set highest ended round globally
      if (allRoundsResult.data?.Round && allRoundsResult.data.Round.length > 0) {
        const highestRound = parseInt(allRoundsResult.data.Round[0].roundId);
        setHighestEndedRound(highestRound);
      }

      // Process bet history
      if (!userRoundsResult.data?.UserRound) {
        setBetHistory([]);
        return;
      }

      // Get unique round IDs to fetch round details
      const roundIds = userRoundsResult.data.UserRound.map(ur => parseInt(ur.roundId));
      
      const roundsResult = await apolloClient.query<GetRoundsByIdsData>({
        query: GET_ROUNDS_BY_IDS,
        variables: { roundIds },
        fetchPolicy: 'network-only',
      });

      // Combine user rounds with round details
      const betHistoryData: BetHistory[] = [];
      
      userRoundsResult.data.UserRound.forEach(userRound => {
        const round = roundsResult.data?.Round.find(r => r.roundId.toString() === userRound.roundId);
        
        const isLocallyClaimed = locallyClaimedRef.current.has(userRound.roundId);
        const actualClaimed = isLocallyClaimed || userRound.claimed;

        const upAmount = BigInt(userRound.upAmount);
        const downAmount = BigInt(userRound.downAmount);
        const roundResult = round?.result ?? 0;
        const totalGrossReward = BigInt(userRound.grossReward);
        const hasBothSides = upAmount > 0n && downAmount > 0n;
          
        // If user bet on UP, create an UP entry
        if (upAmount > 0n) {
          const upShowClaim = hasBothSides ? (roundResult === 1 && totalGrossReward > 0n) : (totalGrossReward > 0n);
          const upWon = roundResult === 1;
          
          betHistoryData.push({
            roundId: userRound.roundId,
            round: round || null,
            userBet: {
              upAmount: userRound.upAmount,
              downAmount: '0'
            },
            reward: upShowClaim ? userRound.grossReward : '0',
            claimed: actualClaimed,
            canClaim: !actualClaimed && upShowClaim && round?.endTs !== undefined && round.endTs !== null,
            won: upWon,
            netPnl: userRound.netPnl
          });
        }

        // If user bet on DOWN, create a DOWN entry
        if (downAmount > 0n) {
          const downShowClaim = hasBothSides ? (roundResult === 2 && totalGrossReward > 0n) : (totalGrossReward > 0n);
          const downWon = roundResult === 2;
          
          betHistoryData.push({
            roundId: userRound.roundId,
            round: round || null,
            userBet: {
              upAmount: '0',
              downAmount: userRound.downAmount
            },
            reward: downShowClaim ? userRound.grossReward : '0',
            claimed: actualClaimed,
            canClaim: !actualClaimed && downShowClaim && round?.endTs !== undefined && round.endTs !== null,
            won: downWon,
            netPnl: userRound.netPnl
          });
        }
      });

      // Sort by round ID descending
      betHistoryData.sort((a, b) => {
        const roundDiff = Number(b.roundId) - Number(a.roundId);
        if (roundDiff !== 0) return roundDiff;
        const aIsUp = BigInt(a.userBet.upAmount) > 0n;
        const bIsUp = BigInt(b.userBet.upAmount) > 0n;
        if (aIsUp && !bIsUp) return -1;
        if (!aIsUp && bIsUp) return 1;
        return 0;
      });
      
      setBetHistory(betHistoryData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const claimReward = async (roundId: bigint) => {
    if (!contract) return;
    
    const roundIdStr = roundId.toString();
    setClaimingRounds(prev => new Set([...prev, roundIdStr]));
    
    try {
      const tx = await contract.claim(roundId);
      await tx.wait();
      
      locallyClaimedRef.current.add(roundIdStr);
      
      setBetHistory(prevHistory => 
        prevHistory.map(bet => 
          bet.roundId === roundIdStr 
            ? { ...bet, claimed: true, canClaim: false }
            : bet
        )
      );
      
      setTimeout(async () => {
        await fetchAllData();
      }, 3000);
      
    } catch (error: any) {
      console.error('Failed to claim reward:', error);
      alert(`Failed to claim reward: ${error.message || 'Unknown error'}`);
    } finally {
      setClaimingRounds(prev => {
        const newSet = new Set(prev);
        newSet.delete(roundIdStr);
        return newSet;
      });
    }
  };

  useEffect(() => {
    if (contract && account && chainId === SEPOLIA_CHAIN_ID) {
      fetchAllData();
    }
  }, [contract, account, chainId]);

  const formatEther = (wei: bigint | string) => {
    const weiValue = typeof wei === 'string' ? wei : wei.toString();
    return parseFloat(ethers.formatEther(weiValue)).toFixed(4);
  };

  const formatPrice = (price: bigint) => {
    return `$${(Number(price) / 1e8).toLocaleString()}`;
  };

  const getBetSide = (userBet: { upAmount: string; downAmount: string }): number | null => {
    const upAmount = BigInt(userBet.upAmount);
    const downAmount = BigInt(userBet.downAmount);
    
    if (upAmount > 0n && downAmount > 0n) {
      return upAmount > downAmount ? 1 : 2;
    }
    if (upAmount > 0n) return 1;
    if (downAmount > 0n) return 2;
    return null;
  };

  const getTotalBetAmount = (userBet: { upAmount: string; downAmount: string }): bigint => {
    return BigInt(userBet.upAmount) + BigInt(userBet.downAmount);
  };

  const calculateWinRate = (userStats: UserStats | null): number => {
    if (!userStats) return 0;
    return Math.round(userStats.winRate * 100);
  };

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
        <p className="text-gray-400">Connect to view your dashboard</p>
      </div>
    );
  }

  if (chainId !== SEPOLIA_CHAIN_ID) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Wrong Network</h3>
        <p className="text-gray-400">Please switch to Sepolia testnet</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-ai-400 border-t-transparent mx-auto mb-4"></div>
        <h3 className="text-xl font-semibold text-white mb-2">Loading Dashboard...</h3>
        <p className="text-gray-400">Fetching your data</p>
      </div>
    );
  }

  const userStats = userStatsData?.UserStats?.[0] || null;
  const aiStats = aiStatsData?.AiStats?.[0] || null;
  const leaderboard = leaderboardData?.LeaderboardRow || [];

  // Calculate claimable rewards
  const totalClaimable = betHistory.reduce((sum, bet) => {
    return bet.canClaim ? sum + BigInt(bet.reward) : sum;
  }, 0n);

  // Get claimable bets for quick claim section
  const claimableBets = betHistory.filter(bet => bet.canClaim);

  // Calculate round statistics
  const uniqueRounds = new Set(betHistory.map(bet => bet.roundId));
  const totalUniqueRounds = uniqueRounds.size;
  
  const roundsMap = new Map<string, boolean>();
  betHistory.forEach(bet => {
    if (bet.round && bet.round.endTs !== null && bet.round.endTs !== undefined && bet.round.endTs !== "0") {
      if (!roundsMap.has(bet.roundId)) {
        const netPnl = BigInt(bet.netPnl || '0');
        roundsMap.set(bet.roundId, netPnl > 0n);
      }
    }
  });
  const finishedRoundsCount = roundsMap.size;

  // Calculate stats for ENDED rounds only
  const totalInvestedEnded = betHistory.reduce((sum, bet) => {
    if (bet.round && bet.round.endTs !== null && bet.round.endTs !== undefined && bet.round.endTs !== "0") {
      const betAmount = BigInt(bet.userBet.upAmount || '0') + BigInt(bet.userBet.downAmount || '0');
      return sum + betAmount;
    }
    return sum;
  }, 0n);

  const totalNetPnlEnded = betHistory.reduce((sum, bet) => {
    if (bet.round && bet.round.endTs !== null && bet.round.endTs !== undefined && bet.round.endTs !== "0") {
      return sum + BigInt(bet.netPnl || '0');
    }
    return sum;
  }, 0n);

  const totalReturnedEnded = totalInvestedEnded + totalNetPnlEnded;

  return (
    <div className="space-y-3">
      {/* STATS SECTION */}
      
      {/* Your Performance */}
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
          
          {/* Main Stats - 5 columns now */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <TrendingUp style={{ width: '1.5rem', height: '1.5rem', color: '#22c55e', margin: '0 auto 0.25rem' }} />
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#22c55e' }}>
                {calculateWinRate(userStats)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Win Rate</div>
              <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.125rem' }}>
                ({finishedRoundsCount} ended)
              </div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <BarChart3 style={{ width: '1.5rem', height: '1.5rem', color: '#3b82f6', margin: '0 auto 0.25rem' }} />
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#3b82f6' }}>
                {totalUniqueRounds}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Total Rounds</div>
              <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.125rem' }}>
                ({finishedRoundsCount} ended)
              </div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <Gift style={{ width: '1.5rem', height: '1.5rem', color: '#f59e0b', margin: '0 auto 0.25rem' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#f59e0b', fontFamily: 'monospace' }}>
                {formatEther(totalClaimable)}
              </div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Claimable</div>
              <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.125rem' }}>
                ({claimableBets.length} bet{claimableBets.length !== 1 ? 's' : ''})
              </div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <Target style={{ width: '1.5rem', height: '1.5rem', color: '#f97316', margin: '0 auto 0.25rem' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#f97316', fontFamily: 'monospace' }}>
                {formatEther(totalInvestedEnded.toString())}
              </div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Invested</div>
              <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.125rem' }}>
                (ended rounds)
              </div>
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <Zap style={{ width: '1.5rem', height: '1.5rem', color: '#c084fc', margin: '0 auto 0.25rem' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#c084fc', fontFamily: 'monospace' }}>
                {formatEther(totalReturnedEnded.toString())}
              </div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Returned</div>
              <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.125rem' }}>
                (ended rounds)
              </div>
            </div>
          </div>
          
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
                ({formatEther(totalReturnedEnded.toString())} - {formatEther(totalInvestedEnded.toString())})
              </span>
            </div>
            <div style={{ 
              fontSize: '1.75rem', 
              fontWeight: '900', 
              fontFamily: 'monospace',
              color: totalNetPnlEnded >= 0n ? '#22c55e' : '#ef4444'
            }}>
              {totalNetPnlEnded >= 0n ? '+' : ''}{formatEther(totalNetPnlEnded.toString())} ETH
            </div>
          </div>

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

      {/* Claimable Rewards Section - Quick Claim - TOP PRIORITY */}
      {claimableBets.length > 0 && (
        <div style={{
          backgroundColor: colors.cardBg,
          border: theme === 'dark' ? '2px solid rgba(245, 158, 11, 0.5)' : '2px solid #f59e0b',
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Gift style={{ width: '1.25rem', height: '1.25rem', color: '#f59e0b' }} />
              <span style={{ fontSize: '1rem', fontWeight: '700', color: colors.text }}>CLAIMABLE REWARDS</span>
            </div>
            <div style={{ 
              fontSize: '1.25rem', 
              fontWeight: '900', 
              color: '#f59e0b',
              fontFamily: 'monospace'
            }}>
              {formatEther(totalClaimable)} ETH
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {claimableBets.map((bet) => {
              const betSide = getBetSide(bet.userBet);
              const totalBet = getTotalBetAmount(bet.userBet);
              const isClaimingThisRound = claimingRounds.has(bet.roundId.toString());
              
              return (
                <div 
                  key={`claim-${bet.roundId}-${betSide === Side.Up ? 'up' : 'down'}`}
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.6)' : 'rgba(254, 252, 232, 0.6)',
                    border: `1px solid ${colors.cardBorder}`,
                    borderRadius: '0.375rem',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: '700', color: colors.textSecondary, minWidth: '50px' }}>
                      #{bet.roundId}
                    </div>
                    {betSide === Side.Up ? (
                      <TrendingUp style={{ width: '1rem', height: '1rem', color: '#22c55e', flexShrink: 0 }} />
                    ) : (
                      <TrendingDown style={{ width: '1rem', height: '1rem', color: '#ef4444', flexShrink: 0 }} />
                    )}
                    <div style={{ fontSize: '0.875rem', color: colors.text }}>
                      <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>{formatEther(totalBet)} ETH</span>
                      <span style={{ color: colors.textSecondary, marginLeft: '0.5rem' }}>on</span>
                      <span style={{ 
                        color: betSide === Side.Up ? '#22c55e' : '#ef4444',
                        fontWeight: '900',
                        marginLeft: '0.5rem'
                      }}>
                        {betSide === Side.Up ? 'UP' : 'DOWN'}
                      </span>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: '0.875rem' }}>
                      <span style={{ color: colors.textSecondary }}>Reward: </span>
                      <span style={{ 
                        color: '#f59e0b',
                        fontWeight: '900',
                        fontFamily: 'monospace'
                      }}>
                        {formatEther(BigInt(bet.reward))} ETH
                      </span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => claimReward(BigInt(bet.roundId))}
                    disabled={isClaimingThisRound}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: isClaimingThisRound ? '#374151' : '#d97706',
                      color: '#ffffff',
                      border: isClaimingThisRound ? '2px solid #4b5563' : '2px solid #f59e0b',
                      borderRadius: '0.5rem',
                      fontSize: '0.8125rem',
                      fontWeight: '900',
                      cursor: isClaimingThisRound ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      if (!isClaimingThisRound) {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isClaimingThisRound) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    {isClaimingThisRound ? (
                      <>
                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                        <span>CLAIMING</span>
                      </>
                    ) : (
                      <>
                        <Gift style={{ width: '1rem', height: '1rem' }} />
                        <span>CLAIM</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Performance */}
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

      {/* Two Column Layout: Recent Bets & Leaderboard */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 400px',
        gap: '1rem',
        alignItems: 'start'
      }}>
        {/* Recent Bets Column */}
        <div>
          {betHistory.length > 0 ? (
        <>
          {/* Bet History List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Recent Bets</h3>
              <div className="text-xs text-gray-400 bg-gray-800/50 px-3 py-1 rounded-full">
                Page {currentPage} of {Math.max(1, Math.ceil(betHistory.length / itemsPerPage))}
              </div>
            </div>
            
            {(() => {
              // Use the global highest ended round (not user-specific)
              return betHistory
                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                .map((bet) => {
                const betSide = getBetSide(bet.userBet);
                const roundEnded = bet.round ? (bet.round.endTs !== null && bet.round.endTs !== undefined && bet.round.endTs !== "0") : false;
                const currentRoundId = parseInt(bet.roundId.toString());
                // Current active round is the one after the highest ended round
                const isCurrentActiveRound = currentRoundId === highestEndedRound + 1;
                // Future rounds are any rounds beyond the current active one
                const isFutureRound = currentRoundId > highestEndedRound + 1;
              
              let betResult: 'won' | 'lost' | 'tie' | 'pending';
              
              if (!roundEnded) {
                betResult = 'pending';
              } else if (bet.round?.result === 0) {
                betResult = 'tie';
              } else if (bet.won) {
                betResult = 'won';
              } else {
                betResult = 'lost';
              }
              const totalBet = getTotalBetAmount(bet.userBet);
              const isClaimingThisRound = claimingRounds.has(bet.roundId.toString());
              
              return (
                <div 
                  key={`${bet.roundId}-${betSide === Side.Up ? 'up' : 'down'}`} 
                  style={{
                    backgroundColor: colors.cardBg,
                    border: `1px solid ${colors.cardBorder}`,
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    transition: 'all 0.2s',
                    cursor: 'default'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(31, 41, 55, 0.9)' : 'rgba(243, 244, 246, 0.9)';
                    e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(99, 102, 241, 0.5)' : '#6366f1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = colors.cardBg;
                    e.currentTarget.style.borderColor = colors.cardBorder;
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '180px' }}>
                    <div style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: '700', 
                      color: colors.textSecondary,
                      minWidth: '60px'
                    }}>
                      #{bet.roundId.toString()}
                    </div>
                    
                    {betSide === Side.Up ? (
                      <TrendingUp style={{ width: '1.125rem', height: '1.125rem', color: '#22c55e', flexShrink: 0 }} />
                    ) : (
                      <TrendingDown style={{ width: '1.125rem', height: '1.125rem', color: '#ef4444', flexShrink: 0 }} />
                    )}
                    
                    <div style={{
                      padding: '0.25rem 0.625rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      backgroundColor: betResult === 'won' ? 'rgba(34, 197, 94, 0.2)' :
                                       betResult === 'lost' ? 'rgba(239, 68, 68, 0.2)' :
                                       betResult === 'pending' ? 'rgba(234, 179, 8, 0.2)' :
                                       'rgba(107, 114, 128, 0.2)',
                      color: betResult === 'won' ? '#22c55e' :
                             betResult === 'lost' ? '#ef4444' :
                             betResult === 'pending' ? '#f59e0b' :
                             colors.textSecondary
                    }}>
                      {betResult === 'won' ? 'WON' : 
                       betResult === 'lost' ? 'LOST' : 
                       betResult === 'pending' ? 'PENDING' : 'TIE'}
                    </div>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1rem',
                    flex: 1,
                    fontSize: '0.875rem'
                  }}>
                    <div style={{ width: '100px', flexShrink: 0 }}>
                      <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginBottom: '0.125rem' }}>BET</div>
                      <div style={{ color: colors.text, fontWeight: '700', fontFamily: 'monospace' }}>
                        {formatEther(totalBet)} ETH
                      </div>
                    </div>

                    <div style={{ width: '70px', flexShrink: 0 }}>
                      <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginBottom: '0.125rem' }}>SIDE</div>
                      <div style={{ 
                        color: betSide === Side.Up ? '#22c55e' : '#ef4444',
                        fontWeight: '900',
                        fontSize: '0.875rem'
                      }}>
                        {betSide === Side.Up ? 'UP' : 'DOWN'}
                      </div>
                    </div>

                    {bet.round && bet.round.endTs && BigInt(bet.round.endTs) > 0n ? (
                      <>
                        <div style={{ width: '180px', flexShrink: 0 }}>
                          <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginBottom: '0.125rem' }}>PRICE</div>
                          <div style={{ 
                            fontFamily: 'monospace',
                            fontSize: '0.8125rem',
                            fontWeight: '600',
                            color: bet.round.endPrice && bet.round.startPrice && BigInt(bet.round.endPrice) > BigInt(bet.round.startPrice) ? '#22c55e' : 
                                   bet.round.endPrice && bet.round.startPrice && BigInt(bet.round.endPrice) < BigInt(bet.round.startPrice) ? '#ef4444' : colors.textSecondary
                          }}>
                            {bet.round.startPrice && bet.round.endPrice ? (
                              <>{formatPrice(BigInt(bet.round.startPrice))} → {formatPrice(BigInt(bet.round.endPrice))}</>
                            ) : '—'}
                          </div>
                        </div>

                        <div style={{ width: '240px', flexShrink: 0 }}>
                          <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginBottom: '0.125rem' }}>DURATION</div>
                          <div style={{ fontSize: '0.7rem', fontWeight: '600', color: colors.text, lineHeight: '1.4' }}>
                            {bet.round.startTs && bet.round.endTs ? (
                              <>
                                {(() => {
                                  const startDate = new Date(Number(bet.round.startTs) * 1000);
                                  const endDate = new Date(Number(bet.round.endTs) * 1000);
                                  const startDateStr = startDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                                  const endDateStr = endDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                                  const sameDay = startDateStr === endDateStr;
                                  
                                  return (
                                    <>
                                      <div>{sameDay ? startDateStr : `${startDateStr} → ${endDateStr}`}</div>
                                      <div>
                                        {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {' → '}
                                        {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                    </>
                                  );
                                })()}
                              </>
                            ) : '—'}
                          </div>
                        </div>

                        <div style={{ width: '110px', flexShrink: 0 }}>
                          <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginBottom: '0.125rem' }}>REWARD</div>
                          <div style={{ 
                            color: BigInt(bet.reward) > 0n ? '#f59e0b' : colors.textSecondary,
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem'
                          }}>
                            {formatEther(BigInt(bet.reward))} ETH
                          </div>
                        </div>
                      </>
                    ) : bet.round && bet.round.endTs && BigInt(bet.round.endTs) === 0n && bet.round.startTs && BigInt(bet.round.startTs) > 0n ? (
                      <div style={{ width: '530px', flexShrink: 0 }}>
                        <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginBottom: '0.125rem' }}>STATUS</div>
                        <div style={{ fontSize: '0.7rem', fontWeight: '600', color: '#f59e0b', lineHeight: '1.4' }}>
                          <div>{new Date(Number(bet.round.startTs) * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <Clock style={{ width: '1rem', height: '1rem' }} />
                            <span>Active since {new Date(Number(bet.round.startTs) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ width: '530px', flexShrink: 0 }}>
                        <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginBottom: '0.125rem' }}>STATUS</div>
                        <div style={{ fontSize: '0.7rem', fontWeight: '600', color: '#f59e0b', lineHeight: '1.4' }}>
                          {(() => {
                            const now = new Date();
                            const currentHour = new Date(now);
                            currentHour.setHours(now.getHours(), 0, 0, 0);
                            
                            if (isCurrentActiveRound) {
                              // This is the current active round (startTs hasn't synced yet)
                              return (
                                <>
                                  <div>{currentHour.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <Clock style={{ width: '1rem', height: '1rem' }} />
                                    <span>Active (syncing...)</span>
                                  </div>
                                </>
                              );
                            } else if (isFutureRound) {
                              // This is a future round, waiting to start
                              const roundsAhead = currentRoundId - highestEndedRound - 1;
                              const futureHour = new Date(now);
                              futureHour.setHours(now.getHours() + roundsAhead, 0, 0, 0);
                              return (
                                <>
                                  <div>{futureHour.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <Clock style={{ width: '1rem', height: '1rem' }} />
                                    <span>Waiting for start...</span>
                                  </div>
                                </>
                              );
                            } else {
                              // Fallback for edge cases
                              return (
                                <>
                                  <div>{currentHour.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <Clock style={{ width: '1rem', height: '1rem' }} />
                                    <span>Pending (syncing...)</span>
                                  </div>
                                </>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ minWidth: '140px', display: 'flex', justifyContent: 'flex-end' }}>
                    {bet.canClaim && (
                      <button
                        onClick={() => claimReward(BigInt(bet.roundId))}
                        disabled={isClaimingThisRound}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: isClaimingThisRound ? '#374151' : '#d97706',
                          color: '#ffffff',
                          border: isClaimingThisRound ? '2px solid #4b5563' : '2px solid #f59e0b',
                          borderRadius: '0.5rem',
                          fontSize: '0.8125rem',
                          fontWeight: '900',
                          cursor: isClaimingThisRound ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          transition: 'all 0.2s',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          if (!isClaimingThisRound) {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.5)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isClaimingThisRound) {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                          }
                        }}
                      >
                        {isClaimingThisRound ? (
                          <>
                            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                            <span>CLAIMING</span>
                          </>
                        ) : (
                          <>
                            <Gift style={{ width: '1rem', height: '1rem' }} />
                            <span>CLAIM</span>
                          </>
                        )}
                      </button>
                    )}
                    
                    {bet.claimed && BigInt(bet.reward) > 0n && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.375rem',
                        color: '#4ade80',
                        fontSize: '0.8125rem',
                        fontWeight: '700'
                      }}>
                        <CheckCircle style={{ width: '1.125rem', height: '1.125rem' }} />
                        <span>CLAIMED</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            });
            })()}
            
            {/* Pagination Controls */}
            {betHistory.length > itemsPerPage && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #374151' }}>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    backgroundColor: currentPage === 1 ? '#1f2937' : '#374151',
                    color: currentPage === 1 ? '#6b7280' : '#ffffff',
                    border: '2px solid #4b5563',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: '700',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <ChevronLeft style={{ width: '1.25rem', height: '1.25rem' }} />
                  Previous
                </button>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {Array.from({ length: Math.ceil(betHistory.length / itemsPerPage) }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      style={{
                        width: '3rem',
                        height: '3rem',
                        backgroundColor: currentPage === page ? '#4f46e5' : '#374151',
                        color: '#ffffff',
                        border: currentPage === page ? '2px solid #6366f1' : '2px solid #4b5563',
                        borderRadius: '0.5rem',
                        fontSize: '1.125rem',
                        fontWeight: '900',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(betHistory.length / itemsPerPage), prev + 1))}
                  disabled={currentPage === Math.ceil(betHistory.length / itemsPerPage)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    backgroundColor: currentPage === Math.ceil(betHistory.length / itemsPerPage) ? '#1f2937' : '#374151',
                    color: currentPage === Math.ceil(betHistory.length / itemsPerPage) ? '#6b7280' : '#ffffff',
                    border: '2px solid #4b5563',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: '700',
                    cursor: currentPage === Math.ceil(betHistory.length / itemsPerPage) ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next
                  <ChevronRight style={{ width: '1.25rem', height: '1.25rem' }} />
                </button>
              </div>
            )}
          </div>
        </>
      ) : userStats ? (
        <div className="text-center py-8">
          <BarChart3 className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <h4 className="text-lg font-semibold mb-2" style={{ color: colors.text }}>No Betting History</h4>
          <p style={{ color: colors.textSecondary }}>You haven't placed any bets yet. Go to the Play tab to get started!</p>
        </div>
      ) : null}
        </div>

        {/* Leaderboard Column */}
        {leaderboard && leaderboard.length > 0 && (
          <div style={{
            backgroundColor: colors.cardBg,
            border: theme === 'dark' ? '1px solid rgba(234, 179, 8, 0.4)' : `1px solid ${colors.cardBorder}`,
            borderRadius: '0.5rem',
            padding: '0.75rem',
            height: 'fit-content',
            maxHeight: '100%',
            position: 'sticky',
            top: '1rem',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Trophy style={{ width: '1rem', height: '1rem', color: '#f59e0b' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: '700', color: colors.text }}>LEADERBOARD</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {leaderboard.slice(0, 10).map((player, index) => (
                <div 
                  key={player.user} 
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.6)' : 'rgba(243, 244, 246, 0.6)',
                    border: `1px solid ${colors.cardBorder}`,
                    borderRadius: '0.25rem',
                    padding: '0.375rem 0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <div style={{ width: '1.25rem', display: 'flex', justifyContent: 'center', fontSize: '0.875rem' }}>
                      {getRankIcon(index)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatAddress(player.user)}
                      </div>
                      <div style={{ fontSize: '0.625rem', color: colors.textSecondary }}>
                        {player.roundsPlayed} rounds
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1.625rem', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.625rem', color: colors.textSecondary }}>WIN</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#22c55e' }}>
                        {(player.winRate * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.625rem', color: colors.textSecondary }}>P&L</div>
                      <div style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        color: BigInt(player.totalNetPnl) >= 0n ? '#22c55e' : '#ef4444',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {BigInt(player.totalNetPnl) >= 0n ? '+' : ''}{formatEther(player.totalNetPnl).substring(0, 8)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


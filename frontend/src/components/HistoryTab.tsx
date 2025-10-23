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
  History as HistoryIcon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Side, SEPOLIA_CHAIN_ID } from '../contracts/PredictronArena';
import { ethers } from 'ethers';
import { GET_USER_BETTING_HISTORY, GET_ROUNDS_BY_IDS } from '../graphql/queries';
import type { GetUserBettingHistoryData, GetRoundsByIdsData, Round as BackendRound } from '../graphql/types';

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

export const HistoryTab: React.FC = () => {
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
  const [betHistory, setBetHistory] = useState<BetHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingRounds, setClaimingRounds] = useState<Set<string>>(new Set());
  const locallyClaimedRef = useRef<Set<string>>(new Set()); // Persistent ref for locally claimed rounds
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Reset to page 1 when bet history changes
  useEffect(() => {
    setCurrentPage(1);
  }, [betHistory.length]);

  const fetchBetHistory = async () => {
    if (!account || !isConnected || chainId !== SEPOLIA_CHAIN_ID) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Trigger result processing by placing a dummy transaction call
      // This will cause the backend to process any pending round results
      if (contract) {
        try {
          // Call view function to get current round - this won't process results
          // but when user next interacts with contract, results will be processed
          await contract.currentRoundId();
        } catch (error) {
          // Ignore errors - this is just to potentially trigger processing
        }
      }
      
      // Fetch user rounds from GraphQL backend
      const userRoundsResult = await apolloClient.query<GetUserBettingHistoryData>({
        query: GET_USER_BETTING_HISTORY,
        variables: { 
          user: account.toLowerCase(),
          chainId: SEPOLIA_CHAIN_ID,
          first: 1000 // Increased limit to fetch all rounds
        },
        fetchPolicy: 'network-only',
      });

      if (!userRoundsResult.data?.UserRound) {
        setBetHistory([]);
        return;
      }

      // Get unique round IDs to fetch round details (convert to numbers)
      const roundIds = userRoundsResult.data.UserRound.map(ur => parseInt(ur.roundId));
      
      const roundsResult = await apolloClient.query<GetRoundsByIdsData>({
        query: GET_ROUNDS_BY_IDS,
        variables: { roundIds },
        fetchPolicy: 'network-only',
      });

      // Combine user rounds with round details - SPLIT into separate entries for UP and DOWN bets
      const betHistoryData: BetHistory[] = [];
      
      userRoundsResult.data.UserRound.forEach(userRound => {
        const round = roundsResult.data?.Round.find(r => r.roundId.toString() === userRound.roundId);
        
        // Check if this bet was locally claimed (persistent across backend refreshes)
        const isLocallyClaimed = locallyClaimedRef.current.has(userRound.roundId);
        const actualClaimed = isLocallyClaimed || userRound.claimed;

        const upAmount = BigInt(userRound.upAmount);
        const downAmount = BigInt(userRound.downAmount);
        const roundResult = round?.result ?? 0; // 0 = None, 1 = Up, 2 = Down
        const totalGrossReward = BigInt(userRound.grossReward);
        const hasBothSides = upAmount > 0n && downAmount > 0n;
          
          // If user bet on UP, create an UP entry
          if (upAmount > 0n) {
            const upShowClaim = hasBothSides ? (roundResult === 1 && totalGrossReward > 0n) : (totalGrossReward > 0n);
            const upWon = roundResult === 1; // UP wins if price went up
            
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
              won: upWon, // Win/Loss based on whether UP won
              netPnl: userRound.netPnl // Keep overall net P&L for reference
            });
          }

          // If user bet on DOWN, create a DOWN entry
          if (downAmount > 0n) {
            const downShowClaim = hasBothSides ? (roundResult === 2 && totalGrossReward > 0n) : (totalGrossReward > 0n);
            const downWon = roundResult === 2; // DOWN wins if price went down
            
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
              won: downWon, // Win/Loss based on whether DOWN won
              netPnl: userRound.netPnl // Keep overall net P&L for reference
            });
          }
      });

      // Sort by round ID descending (newest first), then by side (UP before DOWN)
      betHistoryData.sort((a, b) => {
        const roundDiff = Number(b.roundId) - Number(a.roundId);
        if (roundDiff !== 0) return roundDiff;
        // Same round: show UP bet before DOWN bet
        const aIsUp = BigInt(a.userBet.upAmount) > 0n;
        const bIsUp = BigInt(b.userBet.upAmount) > 0n;
        if (aIsUp && !bIsUp) return -1; // a is UP, b is DOWN -> a comes first
        if (!aIsUp && bIsUp) return 1;  // a is DOWN, b is UP -> b comes first
        return 0; // both same side (shouldn't happen)
      });
      
      setBetHistory(betHistoryData);
    } catch (error) {
      console.error('Failed to fetch bet history:', error);
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
      
      // Mark this round as locally claimed (this persists across backend refreshes)
      locallyClaimedRef.current.add(roundIdStr);
      
      // Update local state immediately to show "Claimed"
      setBetHistory(prevHistory => 
        prevHistory.map(bet => 
          bet.roundId === roundIdStr 
            ? { ...bet, claimed: true, canClaim: false }
            : bet
        )
      );
      
      // Refresh from backend after a delay, but preserve local claimed status
      setTimeout(async () => {
        await fetchBetHistory();
      }, 3000); // 3 second delay to let the backend indexer catch up
      
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
      fetchBetHistory();
    }
  }, [contract, account, chainId]);

  const formatEther = (wei: bigint) => {
    return parseFloat(ethers.formatEther(wei)).toFixed(4);
  };

  const formatPrice = (price: bigint) => {
    return `$${(Number(price) / 1e8).toLocaleString()}`;
  };

  const getBetSide = (userBet: { upAmount: string; downAmount: string }): number | null => {
    const upAmount = BigInt(userBet.upAmount);
    const downAmount = BigInt(userBet.downAmount);
    
    if (upAmount > 0n && downAmount > 0n) {
      return upAmount > downAmount ? 1 : 2; // 1 = Up, 2 = Down
    }
    if (upAmount > 0n) return 1; // Up
    if (downAmount > 0n) return 2; // Down
    return null;
  };

  const getTotalBetAmount = (userBet: { upAmount: string; downAmount: string }): bigint => {
    return BigInt(userBet.upAmount) + BigInt(userBet.downAmount);
  };

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <HistoryIcon className="w-16 h-16 text-ai-400 mx-auto mb-4 animate-pulse" />
        <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400">Connect to view your betting history</p>
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
        <h3 className="text-xl font-semibold text-white mb-2">Loading History...</h3>
        <p className="text-gray-400">Fetching your betting records</p>
      </div>
    );
  }

  if (betHistory.length === 0) {
    return (
      <div className="text-center py-12">
        <HistoryIcon className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">No Betting History</h3>
        <p className="text-gray-400">You haven't placed any bets yet. Go to the Play tab to get started!</p>
      </div>
    );
  }

  const totalClaimable = betHistory.reduce((sum, bet) => {
    return bet.canClaim ? sum + BigInt(bet.reward) : sum;
  }, 0n);

  // Calculate unique rounds and win rate for summary
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
  const wonRoundsCount = Array.from(roundsMap.values()).filter(won => won).length;
  const winRate = finishedRoundsCount > 0 ? Math.round((wonRoundsCount / finishedRoundsCount) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Summary - Stats Style Single Row */}
      <div style={{
        backgroundColor: colors.cardBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: '0.5rem',
        padding: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <HistoryIcon style={{ width: '1.25rem', height: '1.25rem', color: colors.iconPrimary }} />
          <span style={{ fontSize: '1rem', fontWeight: '700', color: colors.text }}>QUICK STATS</span>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <HistoryIcon style={{ width: '1.5rem', height: '1.5rem', color: '#3b82f6', margin: '0 auto 0.25rem' }} />
            <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#3b82f6' }}>
              {totalUniqueRounds}
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Total Rounds</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <Trophy style={{ width: '1.5rem', height: '1.5rem', color: '#22c55e', margin: '0 auto 0.25rem' }} />
            <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#22c55e' }}>
              {winRate}%
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Win Rate</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <Gift style={{ width: '1.5rem', height: '1.5rem', color: '#f59e0b', margin: '0 auto 0.25rem' }} />
            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#f59e0b', fontFamily: 'monospace' }}>
              {formatEther(totalClaimable)}
            </div>
            <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Claimable ETH</div>
          </div>
        </div>
      </div>

      {/* Bet History List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">Recent Bets</h3>
          <div className="text-xs text-gray-400 bg-gray-800/50 px-3 py-1 rounded-full">
            Page {currentPage} of {Math.max(1, Math.ceil(betHistory.length / itemsPerPage))}
          </div>
        </div>
        
        {betHistory
          .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
          .map((bet) => {
          const betSide = getBetSide(bet.userBet);
          const roundEnded = bet.round ? (bet.round.endTs !== null && bet.round.endTs !== undefined && bet.round.endTs !== "0") : false;
          
          // Debug: uncomment to debug round status
          // console.log('Round debug:', {
          //   roundId: bet.roundId,
          //   endTs: bet.round?.endTs,
          //   roundEnded,
          //   won: bet.won,
          //   grossReward: bet.reward
          // });
          
          // Use backend won field and round completion status
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
              {/* Left Section: Round Info & Status */}
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

              {/* Middle Section: Bet Details (flex-grow to take available space) */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1.5rem',
                flex: 1,
                fontSize: '0.875rem'
              }}>
                {/* Bet Amount */}
                <div style={{ minWidth: '90px' }}>
                  <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginBottom: '0.125rem' }}>BET</div>
                  <div style={{ color: colors.text, fontWeight: '700', fontFamily: 'monospace' }}>
                    {formatEther(totalBet)} ETH
                  </div>
                </div>

                {/* Direction */}
                <div style={{ minWidth: '60px' }}>
                  <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginBottom: '0.125rem' }}>SIDE</div>
                  <div style={{ 
                    color: betSide === Side.Up ? '#22c55e' : '#ef4444',
                    fontWeight: '900',
                    fontSize: '0.875rem'
                  }}>
                    {betSide === Side.Up ? 'UP' : 'DOWN'}
                  </div>
                </div>

                {/* Price Change (only if round ended) */}
                {bet.round && bet.round.endTs && BigInt(bet.round.endTs) > 0n && (
                  <div style={{ minWidth: '160px' }}>
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
                )}

                {/* Pending indicator */}
                {bet.round && bet.round.endTs && BigInt(bet.round.endTs) === 0n && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#f59e0b' }}>
                    <Clock style={{ width: '1rem', height: '1rem' }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: '600' }}>In progress...</span>
                  </div>
                )}

                {/* Reward (only if round ended) */}
                {bet.round && bet.round.endTs && BigInt(bet.round.endTs) > 0n && (
                  <div style={{ minWidth: '100px' }}>
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
                )}
              </div>

              {/* Right Section: Action Button or Status */}
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
        })}
        
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
    </div>
  );
};

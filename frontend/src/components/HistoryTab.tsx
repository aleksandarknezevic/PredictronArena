import React, { useState, useEffect, useRef } from 'react';
import apolloClient from '../graphql/client';
import { useWeb3 } from '../contexts/Web3Context';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Gift,
  AlertCircle,
  CheckCircle,
  History as HistoryIcon
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
  const [betHistory, setBetHistory] = useState<BetHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingRounds, setClaimingRounds] = useState<Set<string>>(new Set());
  const locallyClaimedRef = useRef<Set<string>>(new Set()); // Persistent ref for locally claimed rounds

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

          // Determine overall profitability for hedged bets
          const totalBetAmount = upAmount + downAmount;
          const overallProfitable = hasBothSides ? (totalGrossReward > totalBetAmount) : (totalGrossReward > 0n);
          
          // If user bet on UP, create an UP entry
          if (upAmount > 0n) {
            const upShowClaim = hasBothSides ? (roundResult === 1 && totalGrossReward > 0n) : (totalGrossReward > 0n);
            
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
              won: overallProfitable, // Win/Loss based on overall profitability
              netPnl: userRound.netPnl // Keep overall net P&L for reference
            });
          }

          // If user bet on DOWN, create a DOWN entry
          if (downAmount > 0n) {
            const downShowClaim = hasBothSides ? (roundResult === 2 && totalGrossReward > 0n) : (totalGrossReward > 0n);
            
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
              won: overallProfitable, // Win/Loss based on overall profitability
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
        return aIsUp === bIsUp ? 0 : aIsUp ? -1 : 1;
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
      
      // Auto-refresh every 15 seconds to pick up new round endings and reward calculations
      const intervalId = setInterval(() => {
        fetchBetHistory();
      }, 15000);
      
      return () => clearInterval(intervalId);
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Bets */}
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 rounded-xl p-6 border border-gray-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Rounds</p>
              <p className="text-2xl font-bold text-white">
                {(() => {
                  // Count unique rounds (since we split UP/DOWN bets into separate entries)
                  const uniqueRounds = new Set(betHistory.map(bet => bet.roundId));
                  return uniqueRounds.size;
                })()}
              </p>
            </div>
            <HistoryIcon className="w-10 h-10 text-ai-400" />
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 rounded-xl p-6 border border-green-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-300">Win Rate</p>
              <p className="text-2xl font-bold text-green-400">
                {betHistory.length > 0 
                  ? (() => {
                      // Group by round ID to count unique rounds (not individual bet entries)
                      const roundsMap = new Map<string, boolean>();
                      
                      betHistory.forEach(bet => {
                        if (bet.round && bet.round.endTs !== null && bet.round.endTs !== undefined && bet.round.endTs !== "0") {
                          // Only set if not already set (both UP and DOWN entries have same won status)
                          if (!roundsMap.has(bet.roundId)) {
                            roundsMap.set(bet.roundId, bet.won === true);
                          }
                        }
                      });
                      
                      const finishedRoundsCount = roundsMap.size;
                      const wonRoundsCount = Array.from(roundsMap.values()).filter(won => won).length;
                      
                      return finishedRoundsCount > 0 ? `${Math.round((wonRoundsCount / finishedRoundsCount) * 100)}%` : '0%';
                    })()
                  : '0%'
                }
              </p>
            </div>
            <Trophy className="w-10 h-10 text-green-400" />
          </div>
        </div>

        {/* Claimable Rewards */}
        <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/30 rounded-xl p-6 border border-yellow-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-300">Claimable</p>
              <p className="text-2xl font-bold text-yellow-400">{formatEther(totalClaimable)} ETH</p>
            </div>
            <Gift className="w-10 h-10 text-yellow-400" />
          </div>
        </div>
      </div>

      {/* Bet History List */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-white">Recent Bets</h3>
        
        {betHistory.map((bet) => {
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
            <div key={bet.roundId.toString()} className="bg-gray-900/50 rounded-xl p-6 border border-gray-800/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold text-white">
                    Round #{bet.roundId.toString()}
                  </div>
                  {betSide === Side.Up ? (
                    <TrendingUp className="w-5 h-5 text-green-400" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-400" />
                  )}
                  <span className={`px-2 py-1 rounded text-sm font-medium ${
                    betResult === 'won' ? 'bg-green-600/20 text-green-400' :
                    betResult === 'lost' ? 'bg-red-600/20 text-red-400' :
                    betResult === 'pending' ? 'bg-yellow-600/20 text-yellow-400' :
                    'bg-gray-600/20 text-gray-400'
                  }`}>
                    {betResult === 'won' ? 'Won' : 
                     betResult === 'lost' ? 'Lost' : 
                     betResult === 'pending' ? 'Pending' : 'Tie'}
                  </span>
                </div>
                
                {bet.canClaim && (
                  <button
                    onClick={() => claimReward(BigInt(bet.roundId))}
                    disabled={isClaimingThisRound}
                    style={{
                      backgroundColor: isClaimingThisRound ? '#666666' : '#000000',
                      color: '#ffffff',
                      border: '2px solid #000000',
                      padding: '15px 20px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      borderRadius: '8px',
                      cursor: isClaimingThisRound ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {isClaimingThisRound ? (
                      <>
                        <span>⏳</span>
                        <span>CLAIMING...</span>
                      </>
                    ) : (
                      <>
                        <span>🎁</span>
                        <span>CLAIM {formatEther(BigInt(bet.reward))} ETH</span>
                      </>
                    )}
                  </button>
                )}
                
                {bet.claimed && BigInt(bet.reward) > 0n && (
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Claimed</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Bet Amount</p>
                  <p className="text-white font-mono">{formatEther(totalBet)} ETH</p>
                </div>
                
                <div>
                  <p className="text-gray-400">Direction</p>
                  <p className={`font-semibold ${betSide === Side.Up ? 'text-green-400' : 'text-red-400'}`}>
                    {betSide === Side.Up ? 'UP' : 'DOWN'}
                  </p>
                </div>

                {bet.round && bet.round.endTs && BigInt(bet.round.endTs) > 0n && (
                  <>
                    <div>
                      <p className="text-gray-400">Price Change</p>
                      <p className={`font-mono ${
                        bet.round.endPrice && bet.round.startPrice && BigInt(bet.round.endPrice) > BigInt(bet.round.startPrice) ? 'text-green-400' : 
                        bet.round.endPrice && bet.round.startPrice && BigInt(bet.round.endPrice) < BigInt(bet.round.startPrice) ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {bet.round.startPrice && bet.round.endPrice && (
                          <>{formatPrice(BigInt(bet.round.startPrice))} → {formatPrice(BigInt(bet.round.endPrice))}</>
                        )}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-gray-400">Potential Reward</p>
                      <p className="text-white font-mono">{formatEther(BigInt(bet.reward))} ETH</p>
                    </div>
                  </>
                )}

                {bet.round && bet.round.endTs && BigInt(bet.round.endTs) === 0n && (
                  <div className="col-span-2">
                    <p className="text-yellow-400 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Round in progress...
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

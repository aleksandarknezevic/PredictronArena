import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useTheme } from '../contexts/ThemeContext';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Zap,
  Brain,
  Timer,
  Activity,
  CheckCircle
} from 'lucide-react';
import { Side, MIN_BET_WEI, SEPOLIA_CHAIN_ID } from '../contracts/PredictronArena';
import type { Round } from '../contracts/PredictronArena';
import { ethers } from 'ethers';
import { apolloClient } from '../graphql/client';
import { GET_LATEST_ROUNDS } from '../graphql/queries';
import { gql } from '@apollo/client';

export const PlayTab: React.FC = () => {
  const { contract, account, chainId, isConnected } = useWeb3();
  const { theme } = useTheme();
  
  // Theme-aware colors
  const colors = {
    cardBg: theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' : 'rgba(255, 255, 255, 0.9)',
    cardBorder: theme === 'dark' ? 'rgba(75, 85, 99, 0.5)' : 'rgba(209, 213, 219, 0.8)',
    text: theme === 'dark' ? '#ffffff' : '#111827',
    textSecondary: theme === 'dark' ? '#9ca3af' : '#6b7280',
    statusBannerBg: (isActive: boolean) => isActive 
      ? (theme === 'dark' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(249, 115, 22, 0.2)')
      : (theme === 'dark' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.2)'),
    statusBannerBorder: (isActive: boolean) => isActive
      ? (theme === 'dark' ? 'rgba(251, 146, 60, 0.4)' : 'rgba(251, 146, 60, 0.6)')
      : (theme === 'dark' ? 'rgba(167, 139, 250, 0.4)' : 'rgba(167, 139, 250, 0.6)'),
    statusBannerText: (isActive: boolean) => isActive
      ? (theme === 'dark' ? '#fdba74' : '#ea580c')
      : (theme === 'dark' ? '#c4b5fd' : '#7c3aed'),
  };
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [nextRound, setNextRound] = useState<Round | null>(null);
  const [nextRoundId, setNextRoundId] = useState<bigint>(0n);
  const [latestRoundFromBackend, setLatestRoundFromBackend] = useState<number>(0);
  const [latestRoundsFromBackend, setLatestRoundsFromBackend] = useState<any[]>([]);
  const [betAmount, setBetAmount] = useState('0.01');
  const [selectedSide, setSelectedSide] = useState<Side | null>(null);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<bigint>(0n);
  const [currentRoundTimeRemaining, setCurrentRoundTimeRemaining] = useState(0);
  const [nextRoundTimeUntilStart, setNextRoundTimeUntilStart] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch latest rounds from backend (same source as HistoryTab)
  const fetchLatestRoundsFromBackend = async () => {
    if (chainId !== SEPOLIA_CHAIN_ID) return;

    try {
      // Get latest rounds from backend (same as HistoryTab approach)
      const latestRoundsResult = await apolloClient.query({
        query: GET_LATEST_ROUNDS,
        variables: { 
          chainId: SEPOLIA_CHAIN_ID,
          first: 5 // Get latest 5 rounds to determine current state
        },
        fetchPolicy: 'network-only' // Always get fresh data
      });

      const rounds = latestRoundsResult.data.Round || [];
      setLatestRoundsFromBackend(rounds);
      
      if (rounds.length > 0) {
        const latestRoundNumber = Math.max(...rounds.map((r: any) => parseInt(r.roundId)));
        setLatestRoundFromBackend(latestRoundNumber);
      }
    } catch (error) {
      console.error('Failed to fetch backend round data:', error);
    }
  };

  // Fetch current round data from contract
  const fetchRoundData = async (preserveScroll = false) => {
    if (!contract) return;

    // Preserve scroll position during background updates
    const scrollY = preserveScroll ? window.scrollY : 0;

    try {
      if (!preserveScroll) setLoading(true);
      
      // Force fresh data by using overrides to bypass any caching
      const [currentRoundData, nextId, price] = await Promise.all([
        contract.getCurrentRound({ blockTag: 'latest' }),
        contract.nextRoundId({ blockTag: 'latest' }),
        contract.getLatestPrice({ blockTag: 'latest' })
      ]);

      // Try different methods to get next round pool information
      let nextRoundData = null;
      let nextRoundPoolData = null;
      
      try {
        // Method 1: Try the rounds mapping
        nextRoundData = await contract.rounds(nextId, { blockTag: 'latest' });
      } catch (error) {
        // Rounds mapping not available yet
      }

      try {
        // Method 2: Try to get pool amounts directly if methods exist
        const [totalUp, totalDown] = await Promise.all([
          contract.roundTotalUp ? contract.roundTotalUp(nextId, { blockTag: 'latest' }) : null,
          contract.roundTotalDown ? contract.roundTotalDown(nextId, { blockTag: 'latest' }) : null
        ]);
        
        if (totalUp !== null && totalDown !== null) {
          nextRoundPoolData = {
            totalUp,
            totalDown
          };
        }
      } catch (error) {
        // Direct pool methods not available
      }

      // Method 3: Fallback to backend GraphQL data if contract methods fail
      if (!nextRoundData && !nextRoundPoolData) {
        try {
          const backendResult = await apolloClient.query({
            query: gql`
              query GetRound($roundId: numeric!) {
                Round(where: {roundId: {_eq: $roundId}}) {
                  roundId
                  totalUp
                  totalDown
                }
              }
            `,
            variables: { roundId: Number(nextId) },
            fetchPolicy: 'network-only'
          });

          if (backendResult.data.Round && backendResult.data.Round.length > 0) {
            const backendRound = backendResult.data.Round[0];
            nextRoundPoolData = {
              totalUp: BigInt(backendRound.totalUp || 0),
              totalDown: BigInt(backendRound.totalDown || 0)
            };
          }
        } catch (error) {
          // Backend fallback failed
        }
      }

      // IMPORTANT: Use backend to determine the ACTUAL current round (contract may be delayed)
      // The backend knows which round has bets, contract currentRoundId may be stale
      const actualCurrentRoundFromBackend = latestRoundFromBackend || Number(currentRoundData[0]);
      
      // Fetch pool data for the ACTUAL current round from backend (most reliable for active rounds)
      let currentRoundPoolData = null;
      try {
        const backendResult = await apolloClient.query({
          query: gql`
            query GetRound($roundId: numeric!) {
              Round(where: {roundId: {_eq: $roundId}}) {
                roundId
                totalUp
                totalDown
              }
            }
          `,
          variables: { roundId: actualCurrentRoundFromBackend },
          fetchPolicy: 'network-only'
        });

        if (backendResult.data.Round && backendResult.data.Round.length > 0) {
          const backendRound = backendResult.data.Round[0];
          currentRoundPoolData = {
            totalUp: BigInt(backendRound.totalUp || 0),
            totalDown: BigInt(backendRound.totalDown || 0)
          };
        }
      } catch (error) {
        // Backend fetch failed
      }


      // Set current round - prioritize contract data, then pool data, then backend
      // Contract rounds mapping data (might be zero for active rounds)
      const contractTotalUp = currentRoundData[5];
      const contractTotalDown = currentRoundData[6];
      
      // Use contract data if non-zero, otherwise use fetched pool data, otherwise use zeros
      const finalTotalUp = (contractTotalUp > 0n) ? contractTotalUp : (currentRoundPoolData?.totalUp || 0n);
      const finalTotalDown = (contractTotalDown > 0n) ? contractTotalDown : (currentRoundPoolData?.totalDown || 0n);
      
      setCurrentRound({
        id: currentRoundData[0],
        startTs: currentRoundData[1],
        endTs: currentRoundData[2],
        startPrice: currentRoundData[3],
        endPrice: currentRoundData[4],
        totalUp: finalTotalUp,
        totalDown: finalTotalDown,
        winningSide: currentRoundData[7]
      });
      
      // Set next round data for pool display - use either rounds mapping or direct pool data
      if (nextRoundData || nextRoundPoolData) {
        const roundData = {
          id: nextId,
          startTs: nextRoundData ? nextRoundData[1] || 0n : 0n,
          endTs: nextRoundData ? nextRoundData[2] || 0n : 0n,
          startPrice: nextRoundData ? nextRoundData[3] || 0n : 0n,
          endPrice: nextRoundData ? nextRoundData[4] || 0n : 0n,
          totalUp: nextRoundData ? nextRoundData[5] || 0n : (nextRoundPoolData?.totalUp || 0n),
          totalDown: nextRoundData ? nextRoundData[6] || 0n : (nextRoundPoolData?.totalDown || 0n),
          winningSide: nextRoundData ? nextRoundData[7] || 0n : 0n
        };
        
        setNextRound(roundData);
      } else {
        setNextRound(null);
      }
      
      setNextRoundId(nextId);
      setCurrentPrice(price);

      // Restore scroll position after a brief delay
      if (preserveScroll && scrollY > 0) {
        setTimeout(() => window.scrollTo(0, scrollY), 50);
      }
    } catch (error) {
      console.error('Failed to fetch round data:', error);
    } finally {
      if (!preserveScroll) setLoading(false);
    }
  };

  // Calculate time remaining for current and next rounds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      
      // Calculate end of current hour (Round 5 ends at top of next hour)
      const currentHour = Math.floor(now / 3600) * 3600;
      const nextHourStart = currentHour + 3600;
      const currentRoundEnd = nextHourStart;
      const currentRoundRemaining = Math.max(0, currentRoundEnd - now);
      
      // Round 6 starts at the next hour
      const nextRoundStart = nextHourStart;
      const nextRoundTimeUntil = Math.max(0, nextRoundStart - now);
      
      setCurrentRoundTimeRemaining(currentRoundRemaining);
      setNextRoundTimeUntilStart(nextRoundTimeUntil);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fetch data on component mount and when contract changes
  useEffect(() => {
    if (contract && chainId === SEPOLIA_CHAIN_ID) {
      fetchLatestRoundsFromBackend();
      fetchRoundData();
    }
  }, [contract, chainId, account]);

  // Determine current and next round numbers from backend data (same logic as HistoryTab)
  const determineRoundNumbers = () => {
    if (latestRoundsFromBackend.length === 0) {
      // Fallback to contract data if no backend data
      return {
        currentRoundNumber: Number(currentRound?.id || 0),
        nextRoundNumber: Number(nextRoundId || 0),
        hasActiveRound: currentRound && currentRound.startTs > 0n && currentRound.endTs === 0n
      };
    }

    // Sort rounds by roundId to get latest
    const sortedRounds = [...latestRoundsFromBackend].sort((a, b) => parseInt(b.roundId) - parseInt(a.roundId));
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Find the actually active round (startTs exists and in past, endTs is null or in future)
    const activeRound = sortedRounds.find(r => 
      r.startTs != null && 
      r.startTs > 0 && 
      currentTime >= parseInt(r.startTs) &&
      (r.endTs == null || r.endTs === 0 || currentTime < parseInt(r.endTs))
    );
    
    if (activeRound) {
      // Found an active round
      const activeRoundNumber = parseInt(activeRound.roundId);
      return {
        currentRoundNumber: activeRoundNumber,
        nextRoundNumber: activeRoundNumber + 1,
        hasActiveRound: true
      };
    }
    
    // No active round - find the most recent completed round
    const completedRound = sortedRounds.find(r => 
      r.endTs != null && r.endTs > 0 && currentTime >= parseInt(r.endTs)
    );
    
    if (completedRound) {
      const completedRoundNumber = parseInt(completedRound.roundId);
      return {
        currentRoundNumber: completedRoundNumber,
        nextRoundNumber: completedRoundNumber + 1,
        hasActiveRound: false
      };
    }
    
    // Fallback to latest round
    const latestRound = sortedRounds[0];
    const latestRoundNumber = parseInt(latestRound.roundId);
    return {
      currentRoundNumber: latestRoundNumber,
      nextRoundNumber: latestRoundNumber + 1,
      hasActiveRound: false
    };
  };

  const { currentRoundNumber, nextRoundNumber, hasActiveRound } = determineRoundNumbers();
  
  // Use backend data to determine round status (same as HistoryTab)
  const noActiveRoundStatus = !hasActiveRound; // Based on backend data

  // Auto-refresh data - less frequently to avoid scroll disruption
  useEffect(() => {
    if (!contract || chainId !== SEPOLIA_CHAIN_ID) return;

    // Refresh every 10 seconds to keep data fresh
    const refreshInterval = 10000;
    const interval = setInterval(() => {
      fetchLatestRoundsFromBackend();
      fetchRoundData(true); // Preserve scroll position during auto-refresh (includes price update)
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [contract, chainId, account, currentRound, noActiveRoundStatus]);

  // Dedicated price refresh - more frequent to show real-time price
  useEffect(() => {
    if (!contract || chainId !== SEPOLIA_CHAIN_ID) return;

    const priceInterval = setInterval(async () => {
      try {
        const price = await contract.getLatestPrice({ blockTag: 'latest' });
        setCurrentPrice(price);
      } catch (error) {
        console.error('Failed to fetch price:', error);
      }
    }, 5000); // Update price every 5 seconds

    return () => clearInterval(priceInterval);
  }, [contract, chainId]);

  const placeBet = async () => {
    if (!contract || !selectedSide || !account) return;

    const betAmountWei = ethers.parseEther(betAmount);
    if (betAmountWei < MIN_BET_WEI) {
      alert(`Minimum bet is ${ethers.formatEther(MIN_BET_WEI)} ETH`);
      return;
    }

    setIsPlacingBet(true);
    try {
      // Place bet on next round determined from backend data
      const tx = await contract.placeBet(selectedSide, { value: betAmountWei });
      await tx.wait();
      
      // Refresh data after successful bet
      // Wait a moment for the blockchain state to update
      setTimeout(async () => {
        await fetchRoundData();
        await fetchLatestRoundsFromBackend();
      }, 1000);
      
      setSelectedSide(null);
      setBetAmount('0.01');
    } catch (error: any) {
      console.error('Failed to place bet:', error);
      alert(`Failed to place bet: ${error.message || 'Unknown error'}`);
    } finally {
      setIsPlacingBet(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPrice = (price: bigint) => {
    return `$${(Number(price) / 1e8).toLocaleString()}`;
  };

  const formatEther = (wei: bigint) => {
    return parseFloat(ethers.formatEther(wei)).toFixed(3);
  };

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <Zap className="w-16 h-16 text-indigo-400 mx-auto mb-4 animate-pulse" />
        <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400">Connect MetaMask to start playing PredictronArena</p>
      </div>
    );
  }

  if (chainId !== SEPOLIA_CHAIN_ID) {
    return (
      <div className="glass-card text-center py-12 border-red-500/30">
        <Activity className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Wrong Network</h3>
        <p className="text-gray-300">Please switch to Sepolia testnet to play</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card text-center py-12">
        <Brain className="w-16 h-16 text-purple-400 mx-auto mb-4 animate-pulse" />
        <h3 className="text-xl font-semibold text-white mb-2">Loading Game Data...</h3>
        <p className="text-gray-300">Syncing with the blockchain</p>
      </div>
    );
  }

  // Use the backend-calculated round status
  const noActiveRound = !hasActiveRound;
  const canBetOnNextRound = true; // Can always bet on next round

  return (
    <div className="space-y-3">
      {/* Compact Status Banner */}
      <div style={{
        backgroundColor: colors.statusBannerBg(!noActiveRound),
        border: `2px solid ${colors.statusBannerBorder(!noActiveRound)}`,
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        textAlign: 'center'
      }}>
        <div style={{ 
          fontSize: '1.25rem', 
          fontWeight: '900', 
          color: colors.statusBannerText(!noActiveRound),
          marginBottom: '0.25rem'
        }}>
          {noActiveRound ? '🏁' : '🔥'} ROUND #{currentRoundNumber} {hasActiveRound ? 'ACTIVE' : 'ENDED'} • ROUND #{nextRoundNumber} OPEN 🎯
        </div>
        <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
          {hasActiveRound ? 'Round in progress' : 'Round completed'} • Betting open for Round #{nextRoundNumber}
        </div>
      </div>

      {/* Compact Price + Round Info in One Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
        {/* Current Price - Compact */}
        <div style={{
          backgroundColor: colors.cardBg,
          border: theme === 'dark' ? '1px solid rgba(34, 197, 94, 0.3)' : `1px solid ${colors.cardBorder}`,
          borderRadius: '0.5rem',
          padding: '0.75rem 1rem',
          textAlign: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', marginBottom: '0.375rem' }}>
            <DollarSign style={{ width: '1rem', height: '1rem', color: '#22c55e' }} />
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary, fontWeight: '700' }}>ETH PRICE</span>
          </div>
          <div style={{ 
            fontSize: '1.75rem', 
            fontWeight: '900', 
            fontFamily: 'monospace', 
            color: '#22c55e' 
          }}>
            {formatPrice(currentPrice)}
          </div>
          <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Chainlink</div>
        </div>

        {/* Round Status - Compact Side-by-Side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {/* Current Round - Enhanced */}
          <div style={{
            backgroundColor: noActiveRound 
              ? (theme === 'dark' ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)') 
              : (theme === 'dark' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(254, 243, 199, 0.5)'),
            border: noActiveRound 
              ? (theme === 'dark' ? '1px solid rgba(107, 114, 128, 0.3)' : `1px solid ${colors.cardBorder}`)
              : (theme === 'dark' ? '1px solid rgba(251, 146, 60, 0.4)' : '1px solid #fb923c'),
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
              {noActiveRound ? (
                <CheckCircle style={{ width: '1rem', height: '1rem', color: colors.textSecondary }} />
              ) : (
                <Activity style={{ width: '1rem', height: '1rem', color: '#f97316' }} />
              )}
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: colors.text }}>
                ROUND #{currentRoundNumber}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: noActiveRound ? colors.textSecondary : '#f97316', marginBottom: '0.5rem' }}>
              {noActiveRound ? '✅ ENDED' : '🔴 ACTIVE'}
            </div>
            
            {/* Show countdown for active round */}
            {!noActiveRound && (
              <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: '700', color: '#f97316', marginBottom: '0.5rem' }}>
                {formatTime(currentRoundTimeRemaining)}
              </div>
            )}
            
            {/* Show prices */}
            {currentRound && (
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {currentRound.startPrice && currentRound.startPrice > 0n && (
                  <div>
                    <span style={{ color: colors.textSecondary }}>Start: </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: '700', color: colors.text }}>
                      {formatPrice(currentRound.startPrice)}
                    </span>
                  </div>
                )}
                {noActiveRound && currentRound.endPrice && currentRound.endPrice > 0n && (
                  <div>
                    <span style={{ color: colors.textSecondary }}>End: </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: '700', color: colors.text }}>
                      {formatPrice(currentRound.endPrice)}
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Pool info for current round - Show if there are any bets */}
            {currentRound && (currentRound.totalUp > 0n || currentRound.totalDown > 0n) && (
              <div style={{ 
                borderTop: `1px solid ${colors.cardBorder}`,
                paddingTop: '0.5rem',
                marginTop: '0.5rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.5rem',
                fontSize: '0.7rem'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: colors.textSecondary, marginBottom: '0.125rem' }}>UP</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', color: '#22c55e' }}>
                    {formatEther(currentRound.totalUp)}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: colors.textSecondary, marginBottom: '0.125rem' }}>DOWN</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', color: '#ef4444' }}>
                    {formatEther(currentRound.totalDown)}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: colors.textSecondary, marginBottom: '0.125rem' }}>TOTAL</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', color: colors.text }}>
                    {formatEther(currentRound.totalUp + currentRound.totalDown)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Next Round - With Pool Info Merged */}
          <div style={{
            backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(220, 252, 231, 0.6)',
            border: theme === 'dark' ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid #22c55e',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
              <Timer style={{ width: '1rem', height: '1rem', color: '#22c55e' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: colors.text }}>
                ROUND #{nextRoundNumber}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#22c55e', marginBottom: '0.25rem' }}>
              🟢 OPEN
            </div>
            <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: '700', color: '#22c55e', marginBottom: '0.5rem' }}>
              {formatTime(nextRoundTimeUntilStart)}
            </div>
            
            {/* Pool info merged - only show if there are bets AND round ID matches */}
            {nextRound && Number(nextRound.id) === nextRoundNumber && (nextRound.totalUp > 0n || nextRound.totalDown > 0n) && (
              <div style={{ 
                borderTop: `1px solid ${colors.cardBorder}`,
                paddingTop: '0.5rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.5rem',
                fontSize: '0.7rem'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: colors.textSecondary, marginBottom: '0.125rem' }}>UP</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', color: '#22c55e' }}>
                    {formatEther(nextRound.totalUp)}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: colors.textSecondary, marginBottom: '0.125rem' }}>DOWN</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', color: '#ef4444' }}>
                    {formatEther(nextRound.totalDown)}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: colors.textSecondary, marginBottom: '0.125rem' }}>TOTAL</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', color: colors.text }}>
                    {formatEther(nextRound.totalUp + nextRound.totalDown)}
                  </div>
                </div>
              </div>
            )}
            {(!nextRound || Number(nextRound.id) !== nextRoundNumber || (nextRound.totalUp === 0n && nextRound.totalDown === 0n)) && (
              <div style={{ 
                borderTop: `1px solid ${colors.cardBorder}`,
                paddingTop: '0.5rem',
                textAlign: 'center',
                fontSize: '0.75rem',
                color: '#3b82f6',
                fontWeight: '600'
              }}>
                💡 No bets yet - be the first!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Betting Interface for Next Round */}
      {canBetOnNextRound && (
        <div className="glass-card border-2 border-green-500/50 bg-gradient-to-br from-green-900/20 to-blue-900/20" style={{ padding: '1.5rem' }}>
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid rgba(74, 222, 128, 0.4)',
            borderRadius: '0.5rem'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.75rem',
              marginBottom: '0.375rem'
            }}>
              <Timer style={{ width: '1.5rem', height: '1.5rem', color: '#4ade80' }} />
              <span style={{ fontSize: '1.5rem', fontWeight: '900', color: '#ffffff' }}>
                🎮 BET ON ROUND #{nextRoundNumber}
              </span>
              <Timer style={{ width: '1.5rem', height: '1.5rem', color: '#4ade80' }} />
            </div>
            <div style={{ fontSize: '0.875rem', color: '#4ade80', fontWeight: '700' }}>
              Starts in {formatTime(nextRoundTimeUntilStart)}
            </div>
          </div>

          <div className="max-w-2xl mx-auto space-y-4">
            {/* Bet Amount - PROMINENT */}
            <div className="bg-card glass-card compact-padding rounded-lg border border-gray-600/50">
              <label className="block text-lg font-bold text-white mb-4 text-center">
                💰 BET AMOUNT (ETH)
              </label>
              
                {/* Quick amount buttons */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {['0.005', '0.01', '0.05', '0.1'].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setBetAmount(amount)}
                      style={{
                        backgroundColor: betAmount === amount ? '#4f46e5' : '#374151',
                        color: '#ffffff',
                        border: betAmount === amount ? '2px solid #ffffff' : '2px solid #6b7280',
                        padding: '0.75rem 1rem',
                        fontSize: '1.125rem',
                        fontWeight: '900',
                        borderRadius: '0.5rem',
                        cursor: 'pointer'
                      }}
                    >
                      {amount}
                    </button>
                  ))}
                </div>
              
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  step="0.001"
                  min={ethers.formatEther(MIN_BET_WEI)}
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1f2937',
                    color: '#ffffff',
                    border: '2px solid #6366f1',
                    padding: '1rem 5rem 1rem 1.25rem',
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    borderRadius: '0.5rem',
                    textAlign: 'center'
                  }}
                  placeholder="0.01"
                />
                <div style={{
                  position: 'absolute',
                  right: '1.25rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '1.25rem',
                  fontWeight: '700',
                  color: '#9ca3af',
                  pointerEvents: 'none'
                }}>
                  ETH
                </div>
              </div>
              
              <div className="flex justify-between text-sm mt-3">
                <span className="text-gray-400">
                  Min: {ethers.formatEther(MIN_BET_WEI)} ETH
                </span>
                <span className="text-green-400 font-semibold">
                  ≈ ${(parseFloat(betAmount || '0') * 2500).toFixed(2)} USD
                </span>
              </div>
            </div>

            {/* Side Selection - SUPER VISIBLE */}
              <div className="space-y-4">
                <label className="block text-lg font-bold text-white text-center">
                  🎯 MAKE YOUR PREDICTION
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <button
                    onClick={() => setSelectedSide(Side.Up)}
                    style={{
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      border: selectedSide === Side.Up ? '4px solid #86efac' : '4px solid #22c55e',
                      opacity: selectedSide === Side.Up ? 1 : 0.7,
                      padding: '2rem 1.5rem',
                      minHeight: '180px',
                      fontSize: '2.25rem',
                      fontWeight: '900',
                      borderRadius: '1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.75rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    <TrendingUp style={{ width: '4rem', height: '4rem' }} />
                    <span>UP</span>
                    <span style={{ fontSize: '1.125rem', fontWeight: '700' }}>📈 PRICE RISE</span>
                  </button>
                  <button
                    onClick={() => setSelectedSide(Side.Down)}
                    style={{
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: selectedSide === Side.Down ? '4px solid #fca5a5' : '4px solid #ef4444',
                      opacity: selectedSide === Side.Down ? 1 : 0.7,
                      padding: '2rem 1.5rem',
                      minHeight: '180px',
                      fontSize: '2.25rem',
                      fontWeight: '900',
                      borderRadius: '1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.75rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    <TrendingDown style={{ width: '4rem', height: '4rem' }} />
                    <span>DOWN</span>
                    <span style={{ fontSize: '1.125rem', fontWeight: '700' }}>📉 PRICE FALL</span>
                  </button>
                </div>
              
              {selectedSide && (
                <div style={{
                  textAlign: 'center',
                  marginTop: '1rem',
                  padding: '1.5rem',
                  backgroundColor: selectedSide === Side.Up ? '#15803d' : '#991b1b',
                  border: selectedSide === Side.Up ? '3px solid #4ade80' : '3px solid #f87171',
                  borderRadius: '0.5rem'
                }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#ffffff', marginBottom: '0.25rem' }}>
                    ✅ You selected: {selectedSide === Side.Up ? <span style={{ color: '#86efac' }}>UP 📈</span> : <span style={{ color: '#fca5a5' }}>DOWN 📉</span>}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: '700', color: '#f3f4f6' }}>
                    You predict the price will {selectedSide === Side.Up ? 'RISE' : 'FALL'}
                  </div>
                </div>
              )}
            </div>

            {/* Place Bet Button */}
            <div style={{ paddingTop: '1.5rem' }}>
              <button
                onClick={placeBet}
                disabled={!selectedSide || isPlacingBet}
                style={{
                  width: '100%',
                  backgroundColor: (!selectedSide || isPlacingBet) ? '#374151' : '#4f46e5',
                  color: '#ffffff',
                  border: (!selectedSide || isPlacingBet) ? '4px solid #4b5563' : '4px solid #6366f1',
                  padding: '1.75rem 2rem',
                  fontSize: '1.875rem',
                  fontWeight: '900',
                  borderRadius: '0.75rem',
                  cursor: (!selectedSide || isPlacingBet) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '1rem',
                  transition: 'all 0.2s'
                }}
              >
                {isPlacingBet ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                    <span>PLACING BET...</span>
                  </>
                ) : (
                  <>
                    <Zap style={{ width: '2.5rem', height: '2.5rem' }} />
                    <span>PLACE BET NOW</span>
                    <Zap style={{ width: '2.5rem', height: '2.5rem' }} />
                  </>
                )}
              </button>
              
              {(!selectedSide || !betAmount) && (
                <div style={{
                  textAlign: 'center',
                  marginTop: '1rem',
                  backgroundColor: '#a16207',
                  border: '3px solid #facc15',
                  borderRadius: '0.5rem',
                  padding: '1rem'
                }}>
                  <p style={{ color: '#ffffff', fontSize: '1.125rem', fontWeight: '900', margin: 0 }}>
                    ⚠️ {!selectedSide ? 'Please select UP or DOWN first!' : 'Please enter bet amount!'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

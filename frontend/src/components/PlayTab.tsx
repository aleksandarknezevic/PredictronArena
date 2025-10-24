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
  const [latestRoundsFromBackend, setLatestRoundsFromBackend] = useState<any[]>([]);
  const [betAmount, setBetAmount] = useState('0.01');
  const [selectedSide, setSelectedSide] = useState<Side | null>(null);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<bigint>(0n);
  const [currentRoundTimeRemaining, setCurrentRoundTimeRemaining] = useState(0);
  const [nextRoundTimeUntilStart, setNextRoundTimeUntilStart] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch current round data from contract (now includes backend data fetching)
  const fetchRoundData = async (preserveScroll = false) => {
    if (!contract) return;

    // Preserve scroll position during background updates
    const scrollY = preserveScroll ? window.scrollY : 0;

    try {
      if (!preserveScroll) setLoading(true);
      
      // STEP 1: Fetch fresh backend data FIRST to know which rounds to query
      const latestRoundsResult = await apolloClient.query({
        query: GET_LATEST_ROUNDS,
        variables: { 
          chainId: SEPOLIA_CHAIN_ID,
          first: 5
        },
        fetchPolicy: 'network-only'
      });
      const freshBackendRounds = latestRoundsResult.data.Round || [];
      setLatestRoundsFromBackend(freshBackendRounds);
      
      // STEP 2: Determine which round numbers to display
      const currentTime = Math.floor(Date.now() / 1000);
      let currentRoundToFetch = 0;
      let nextRoundToFetch = 0;
      
      if (freshBackendRounds.length > 0) {
        const sortedRounds = [...freshBackendRounds].sort((a, b) => parseInt(b.roundId) - parseInt(a.roundId));
        
        // Find active round
        const activeRound = sortedRounds.find(r => 
          r.startTs != null && 
          r.startTs > 0 && 
          currentTime >= parseInt(r.startTs) &&
          (r.endTs == null || r.endTs === 0 || currentTime < parseInt(r.endTs))
        );
        
        if (activeRound) {
          currentRoundToFetch = parseInt(activeRound.roundId);
          nextRoundToFetch = currentRoundToFetch + 1;
        } else {
          // Find most recent completed round
          const completedRound = sortedRounds.find(r => 
            r.endTs != null && r.endTs > 0 && currentTime >= parseInt(r.endTs)
          );
          if (completedRound) {
            currentRoundToFetch = parseInt(completedRound.roundId);
            nextRoundToFetch = currentRoundToFetch + 1;
          } else {
            // Fallback to latest round in backend
            currentRoundToFetch = parseInt(sortedRounds[0].roundId);
            nextRoundToFetch = currentRoundToFetch + 1;
          }
        }
      } else {
        // Fallback - assume latest round if no backend data (shouldn't happen)
        currentRoundToFetch = 1;
        nextRoundToFetch = 2;
      }
      
      // STEP 3: Also check backend for betting phase rounds (rounds with bets but no startTs yet)
      const bettingPhaseRound = freshBackendRounds.find((r: any) =>
        (r.totalUp && BigInt(r.totalUp) > 0n) || (r.totalDown && BigInt(r.totalDown) > 0n)
      );
      
      // If there's a betting phase round with a higher ID than currentRoundToFetch, use it as next
      if (bettingPhaseRound) {
        const bettingRoundId = parseInt(bettingPhaseRound.roundId);
        if (bettingRoundId > currentRoundToFetch) {
          nextRoundToFetch = bettingRoundId;
        }
      }
      
      // STEP 4: Use ONLY backend data - contract calls keep failing
      const currentBackendRound = freshBackendRounds.find((r: any) => parseInt(r.roundId) === currentRoundToFetch);
      const nextBackendRound = freshBackendRounds.find((r: any) => parseInt(r.roundId) === nextRoundToFetch);
      
      // Get price with multiple fallback strategies
      let price = 0n;
      try {
        price = await contract.getLatestPrice();
      } catch (err) {
        console.warn('Failed to get price from contract, trying fallback');
        // Fallback 1: Use price from backend round data
        if (currentBackendRound?.endPrice && BigInt(currentBackendRound.endPrice) > 0n) {
          price = BigInt(currentBackendRound.endPrice);
        } else if (currentBackendRound?.startPrice && BigInt(currentBackendRound.startPrice) > 0n) {
          price = BigInt(currentBackendRound.startPrice);
        } else if (nextBackendRound?.startPrice && BigInt(nextBackendRound.startPrice) > 0n) {
          price = BigInt(nextBackendRound.startPrice);
        }
        // Fallback 2: Keep previous price if we have one
        if (price === 0n && currentPrice > 0n) {
          price = currentPrice;
        }
      }
      
      // STEP 5: Build round objects using ONLY backend data
      const currentRoundObj = {
        id: BigInt(currentRoundToFetch),
        startTs: currentBackendRound?.startTs ? BigInt(currentBackendRound.startTs) : 0n,
        endTs: currentBackendRound?.endTs ? BigInt(currentBackendRound.endTs) : 0n,
        startPrice: currentBackendRound?.startPrice ? BigInt(currentBackendRound.startPrice) : 0n,
        endPrice: currentBackendRound?.endPrice ? BigInt(currentBackendRound.endPrice) : 0n,
        totalUp: currentBackendRound?.totalUp ? BigInt(currentBackendRound.totalUp) : 0n,
        totalDown: currentBackendRound?.totalDown ? BigInt(currentBackendRound.totalDown) : 0n,
        winningSide: currentBackendRound?.result || 0
      };
      
      const nextRoundData = {
        id: BigInt(nextRoundToFetch),
        startTs: nextBackendRound?.startTs ? BigInt(nextBackendRound.startTs) : 0n,
        endTs: nextBackendRound?.endTs ? BigInt(nextBackendRound.endTs) : 0n,
        startPrice: nextBackendRound?.startPrice ? BigInt(nextBackendRound.startPrice) : 0n,
        endPrice: nextBackendRound?.endPrice ? BigInt(nextBackendRound.endPrice) : 0n,
        totalUp: nextBackendRound?.totalUp ? BigInt(nextBackendRound.totalUp) : 0n,
        totalDown: nextBackendRound?.totalDown ? BigInt(nextBackendRound.totalDown) : 0n,
        winningSide: nextBackendRound?.result || 0
      };
      
      setCurrentRound(currentRoundObj);
      setNextRound(nextRoundData);
      
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
      fetchRoundData();
    }
  }, [contract, chainId, account]);

  // Use the round IDs directly from the fetched state to ensure consistency
  // Fallback to latest backend data while loading
  const currentRoundNumber = currentRound?.id 
    ? Number(currentRound.id)
    : (latestRoundsFromBackend.length > 0 
        ? parseInt(latestRoundsFromBackend[0].roundId) 
        : 0);
  
  const nextRoundNumber = nextRound?.id 
    ? Number(nextRound.id)
    : (currentRoundNumber > 0 ? currentRoundNumber + 1 : 0);
  
  const hasActiveRound = currentRound && currentRound.startTs > 0n && currentRound.endTs === 0n;

  // DISABLED: Auto-refresh causes MetaMask circuit breaker
  // User can manually refresh the page to update data
  // useEffect(() => {
  //   if (!contract || chainId !== SEPOLIA_CHAIN_ID) return;
  //   const refreshInterval = 15000;
  //   const interval = setInterval(() => {
  //     fetchRoundData(true);
  //   }, refreshInterval);
  //   return () => clearInterval(interval);
  // }, [contract, chainId, account, currentRound, noActiveRoundStatus]);

  // Price is already fetched in fetchRoundData every 3 seconds - no need for separate refresh

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
      const tx = await contract.placeBet(selectedSide, { 
        value: betAmountWei,
        gasLimit: 200000 // Set explicit gas limit to avoid estimation calls
      });
      await tx.wait();
      
      alert('Bet placed successfully! ✅');
      
      // Refresh data after successful bet
      // Wait a moment for the blockchain state to update
      setTimeout(async () => {
        await fetchRoundData();
      }, 2000);
      
      setSelectedSide(null);
      setBetAmount('0.01');
    } catch (error: any) {
      console.error('Failed to place bet:', error);
      
      // Handle specific errors
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        alert('Transaction cancelled by user');
      } else if (error.message?.includes('circuit breaker')) {
        alert('MetaMask rate limit reached. Please wait 30 seconds and try again.');
      } else if (error.message?.includes('insufficient funds')) {
        alert('Insufficient ETH balance');
      } else {
        alert(`Failed to place bet: ${error.shortMessage || error.message || 'Unknown error'}`);
      }
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

            {/* Pool info merged - only show if there are bets */}
            {nextRound && (nextRound.totalUp > 0n || nextRound.totalDown > 0n) && (
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
            {(!nextRound || (nextRound.totalUp === 0n && nextRound.totalDown === 0n)) && (
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

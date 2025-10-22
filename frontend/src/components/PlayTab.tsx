import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
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
        console.log('Latest rounds from backend:', rounds.map((r: any) => `Round ${r.roundId} (endTs: ${r.endTs})`));
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
        console.log('Round mapping data for round', nextId.toString(), ':', nextRoundData);
      } catch (error) {
        console.log('Round mapping failed:', error);
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
          console.log('Direct pool data for round', nextId.toString(), ':', {
            totalUp: totalUp.toString(),
            totalDown: totalDown.toString(),
            totalUpFormatted: formatEther(totalUp),
            totalDownFormatted: formatEther(totalDown)
          });
        }
      } catch (error) {
        console.log('Direct pool methods not available:', error);
      }

      // Method 3: Fallback to backend GraphQL data if contract methods fail
      if (!nextRoundData && !nextRoundPoolData) {
        try {
          console.log('Attempting to fetch round data from backend as fallback...');
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
            console.log('Backend fallback data for round', nextId.toString(), ':', {
              totalUp: backendRound.totalUp,
              totalDown: backendRound.totalDown,
              totalUpFormatted: formatEther(BigInt(backendRound.totalUp || 0)),
              totalDownFormatted: formatEther(BigInt(backendRound.totalDown || 0))
            });
          } else {
            console.log('No backend data found for round', nextId.toString());
          }
        } catch (error) {
          console.log('Backend fallback failed:', error);
        }
      }

      console.log('🔍 CONTRACT DATA ANALYSIS:', {
        currentRoundData: {
          id: currentRoundData[0].toString(),
          startTs: currentRoundData[1].toString(),
          endTs: currentRoundData[2].toString(),
          startPrice: currentRoundData[3].toString(),
          endPrice: currentRoundData[4].toString(),
          totalUp: currentRoundData[5].toString(),
          totalDown: currentRoundData[6].toString(),
          hasStarted: currentRoundData[1] > 0n,
          hasEnded: currentRoundData[2] > 0n,
          isActive: currentRoundData[1] > 0n && currentRoundData[2] === 0n
        },
        nextId: nextId.toString(),
        currentTime: Math.floor(Date.now() / 1000),
        latestFromBackend: latestRoundFromBackend,
        interpretation: {
          contractSaysCurrentRound: currentRoundData[0].toString(),
          contractSaysNextRound: nextId.toString(),
          shouldCurrentRoundBeActive: currentRoundData[1] > 0n && currentRoundData[2] === 0n,
          backendCurrentRound: currentRoundNumber,
          backendNextRound: nextRoundNumber,
          backendHasActiveRound: hasActiveRound,
          whoIsWrong: hasActiveRound ? 'Active round found from backend' : 'No active round from backend'
        }
      });

      setCurrentRound({
        id: currentRoundData[0],
        startTs: currentRoundData[1],
        endTs: currentRoundData[2],
        startPrice: currentRoundData[3],
        endPrice: currentRoundData[4],
        totalUp: currentRoundData[5],
        totalDown: currentRoundData[6],
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
        console.log('Set nextRound state from', nextRoundData ? 'rounds mapping' : 'direct pool data', ':', {
          totalUp: roundData.totalUp.toString(),
          totalDown: roundData.totalDown.toString(),
          totalUpFormatted: formatEther(roundData.totalUp),
          totalDownFormatted: formatEther(roundData.totalDown)
        });
      } else {
        console.log('No round data available, setting null');
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
  
  // Calculate round status for use in useEffect - USING BACKEND DATA
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Use backend data to determine round status (same as HistoryTab)
  const roundHasStarted = hasActiveRound || latestRoundsFromBackend.length > 0;
  const roundHasEnded = !hasActiveRound && latestRoundsFromBackend.length > 0;
  const noActiveRoundStatus = !hasActiveRound; // Based on backend data

  // Auto-refresh data - less frequently to avoid scroll disruption
  useEffect(() => {
    if (!contract || chainId !== SEPOLIA_CHAIN_ID) return;

    // Refresh every 15 seconds when no active round, 30 seconds when active (less intrusive)
    const refreshInterval = noActiveRoundStatus ? 15000 : 30000;
    const interval = setInterval(() => {
      console.log(`Auto-refreshing round data... (${noActiveRoundStatus ? 'No active round - checking for new rounds' : 'Active round - updating data'})`);
      fetchLatestRoundsFromBackend();
      fetchRoundData(true); // Preserve scroll position during auto-refresh
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [contract, chainId, account, currentRound, noActiveRoundStatus]);

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
      console.log(`Placing bet on Round ${nextRoundNumber} (backend data, contract nextRoundId: ${nextRoundId})`);
      const tx = await contract.placeBet(selectedSide, { value: betAmountWei });
      await tx.wait();
      
      // Refresh data after successful bet
      console.log('Bet successful, refreshing data...');
      
      // Wait a moment for the blockchain state to update
      setTimeout(async () => {
        await fetchRoundData();
        await fetchLatestRoundsFromBackend();
        console.log('Data refreshed after bet');
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
      <div className="glass-card text-center py-12">
        <Zap className="w-16 h-16 text-indigo-400 mx-auto mb-4 animate-pulse" />
        <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-300">Connect MetaMask to start playing PredictronArena</p>
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

  // Use CONTRACT data as primary source for current round (most accurate for active rounds)
  // Backend user history is only supplementary and may be stale
  const backendCurrentRound = currentRoundNumber;
  const backendNextRound = nextRoundNumber;
  
  const contractCurrentRound = currentRound ? Number(currentRound.id) : 0;
  const contractNextRound = Number(nextRoundId);
  
  const canBetOnNextRound = true; // Can always bet on next round
  const isCurrentRoundActive = currentRound && currentRound.startTs > 0n && currentRound.endTs === 0n;
  
  // Use the backend-calculated round status
  const noActiveRound = !hasActiveRound;

  // Debug logging to understand contract vs backend state
  console.log('🚨 SYNC ISSUE DEBUG - PlayTab Round State:', {
    backend: { 
      current: backendCurrentRound, 
      next: backendNextRound,
      source: 'latestRoundFromBackend from user betting history'
    },
    contract: { 
      current: contractCurrentRound, 
      next: contractNextRound,
      source: 'live contract state'
    },
    final: { current: currentRoundNumber, next: nextRoundNumber },
    contractRound: currentRound ? {
      id: currentRound.id.toString(),
      startTs: currentRound.startTs.toString(),
      endTs: currentRound.endTs.toString(),
      totalUp: currentRound.totalUp.toString(),
      totalDown: currentRound.totalDown.toString(),
      isActive: currentRound.startTs > 0n && currentRound.endTs === 0n,
      isEnded: currentRound.endTs > 0n
    } : null,
    isCurrentRoundActive,
    noActiveRound,
    roundStatus: {
      currentTime,
      hasStarted: roundHasStarted,
      hasEnded: roundHasEnded,
      shouldShowAsActive: roundHasStarted && !roundHasEnded,
      shouldShowAsEnded: roundHasEnded
    },
    possibleIssue: contractCurrentRound !== backendCurrentRound ? 'BACKEND/CONTRACT MISMATCH! (using contract data)' : 'sync OK',
    prioritySource: 'CONTRACT (authoritative for active rounds)',
    timestamp: new Date().toLocaleTimeString()
  });

  // Determine banner messaging based on round state
  const getBannerContent = () => {
    if (noActiveRound) {
      return {
        title: `🔮 ROUND #${currentRoundNumber} ENDED • ROUND #${nextRoundNumber} BETTING OPEN! 🎯`,
        subtitle: `Round #${currentRoundNumber} finished • Place bets for Round #${nextRoundNumber} below ⬇️`
      };
    } else {
      return {
        title: `🔥 ROUND #${currentRoundNumber} ACTIVE • ROUND #${nextRoundNumber} BETTING OPEN! 🔥`,
        subtitle: `Round #${currentRoundNumber} is running ⏰ • Place bets for Round #${nextRoundNumber} below ⬇️`
      };
    }
  };

  const bannerContent = getBannerContent();

  return (
    <div className="space-y-8">
      {/* Game Status Banner */}
      <div className={`bg-gradient-to-r ${noActiveRound 
        ? 'from-purple-600/20 via-blue-600/20 to-green-600/20 border-purple-400/50' 
        : 'from-orange-600/20 via-green-600/20 to-blue-600/20 border-orange-400/50'
      } border-2 rounded-2xl p-6 text-center`}>
        
        {/* Status Notice */}
        <div className="mb-4 p-3 bg-blue-900/30 rounded-lg border border-blue-600/50">
          <p className="text-blue-300 text-sm">
            ℹ️ <strong>Current Status:</strong> {hasActiveRound ? 'Active round in progress' : 'No active round'}. 
            Round {currentRoundNumber} {hasActiveRound ? 'active' : 'completed'} → Round {nextRoundNumber} open for betting.
          </p>
        </div>

        <div className={`text-2xl font-black mb-2 ${noActiveRound ? 'text-purple-400' : 'text-orange-400'}`}>
          {bannerContent.title}
        </div>
        <div className="text-lg text-white">
          {bannerContent.subtitle}
        </div>
      </div>

      {/* Current Price Display */}
      <div className="glass-card p-8 border border-gray-600/50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center justify-center gap-3">
            <DollarSign className="w-8 h-8 text-green-400" />
            Current ETH Price
          </h2>
          <div className="text-5xl font-mono font-bold text-green-400 mb-2">
            {formatPrice(currentPrice)}
          </div>
          <p className="text-gray-300">Live price feed from Chainlink</p>
        </div>
      </div>

      {/* Round Information - Split into Current and Next Round */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Round Status */}
        <div className={`glass-card p-6 border-2 ${noActiveRound 
          ? 'border-gray-500/50 bg-gray-900/10' 
          : 'border-orange-500/50 bg-orange-900/10'
        }`}>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            {noActiveRound ? (
              <>
                <CheckCircle className="w-5 h-5 text-gray-400" />
{`Round #${currentRoundNumber} - ENDED`}
              </>
            ) : (
              <>
                <Activity className="w-5 h-5 text-orange-400 animate-pulse" />
{`Round #${currentRoundNumber} - ACTIVE`}
              </>
            )}
          </h3>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              {noActiveRound ? (
                <span className="text-gray-400 font-semibold">✅ COMPLETED</span>
              ) : (
                <span className="text-orange-400 font-semibold animate-pulse">🔴 RUNNING</span>
              )}
            </div>
            {!noActiveRound && (
              <div className="flex justify-between">
                <span className="text-gray-400">Ends in:</span>
                <span className="text-orange-300 font-mono font-bold">{formatTime(currentRoundTimeRemaining)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Current Price:</span>
              <span className="text-white font-mono">{formatPrice(currentPrice)}</span>
            </div>
            <div className={`pt-2 border-t ${noActiveRound ? 'border-gray-700/50' : 'border-orange-700/50'}`}>
              <div className="text-center">
                {noActiveRound ? (
                  <p className="text-gray-300 text-sm font-semibold">🏁 Round Finished</p>
                ) : (
                  <p className="text-orange-300 text-sm font-semibold">⏳ Betting Closed - Round in Progress</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Next Round - Open for Betting */}
        <div className="glass-card p-6 border-2 border-green-500/50 bg-green-900/10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Timer className="w-5 h-5 text-green-400" />
{`Round #${nextRoundNumber} - BETTING OPEN`}
          </h3>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className="text-green-400 font-semibold">🟢 ACCEPTING BETS</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Starts in:</span>
              <span className="text-green-300 font-mono font-bold">{formatTime(nextRoundTimeUntilStart)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Start Price:</span>
              <span className="text-gray-500 font-mono">TBD</span>
            </div>
            <div className="pt-2 border-t border-green-700/50">
              <div className="text-center">
                <p className="text-green-300 text-sm font-semibold">✅ Place your bets below!</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Next Round Pool Information */}
      <div className="glass-card p-6 border border-green-600/50 bg-green-900/5">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-400" />
          {`Round #${nextRoundNumber} Pool (Next Round)`}
        </h3>
        
        {nextRound && nextRound.totalUp === 0n && nextRound.totalDown === 0n && (
          <div className="mb-3 p-3 bg-blue-900/30 rounded-lg border border-blue-600/50">
            <p className="text-blue-300 text-sm">
              💡 <strong>Round #{nextRoundNumber} is ready for bets!</strong> Be the first to place a bet.
            </p>
          </div>
        )}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-gray-400">Up Bets:</span>
            </div>
            <span className="text-green-400 font-mono">
              {nextRound ? `${formatEther(nextRound.totalUp)} ETH` : '0.000 ETH'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-400" />
              <span className="text-gray-400">Down Bets:</span>
            </div>
            <span className="text-red-400 font-mono">
              {nextRound ? `${formatEther(nextRound.totalDown)} ETH` : '0.000 ETH'}
            </span>
          </div>
          <div className="pt-2 border-t border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 font-semibold">Total Pool:</span>
              <span className="text-white font-mono font-bold">
                {nextRound 
                  ? `${formatEther(nextRound.totalUp + nextRound.totalDown)} ETH`
                  : '0.000 ETH'
                }
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Betting Interface for Next Round - SUPER PROMINENT */}
      {canBetOnNextRound && (
        <div className="glass-card p-8 border-2 border-green-500/50 bg-gradient-to-br from-green-900/20 to-blue-900/20">
          <h3 className="text-3xl font-black text-white mb-8 text-center flex items-center justify-center gap-4">
            <Timer className="w-12 h-12 text-green-400 animate-pulse" />
            🎮 BET ON ROUND #{nextRoundNumber} 🎮
            <Timer className="w-12 h-12 text-green-400 animate-pulse" />
          </h3>
          
          <div className="text-center mb-6 p-4 bg-green-900/30 rounded-lg border border-green-600/50">
            <p className="text-green-300 font-semibold">
{`🚀 Round #${nextRoundNumber} starts in ${formatTime(nextRoundTimeUntilStart)} • Place your bets now!`}
            </p>
          </div>

          <div className="max-w-2xl mx-auto space-y-8">
            {/* Bet Amount - PROMINENT */}
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 p-6 rounded-2xl border border-gray-600/50">
              <label className="block text-lg font-bold text-white mb-4 text-center">
                💰 BET AMOUNT (ETH)
              </label>
              
                {/* Quick amount buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                  {['0.005', '0.01', '0.05', '0.1'].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setBetAmount(amount)}
                      style={{
                        backgroundColor: betAmount === amount ? '#000000' : '#ffffff',
                        color: betAmount === amount ? '#ffffff' : '#000000',
                        border: '2px solid #000000',
                        padding: '10px 8px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      {amount} ETH
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
                    padding: '20px 60px 20px 20px',
                    backgroundColor: '#ffffff',
                    border: '2px solid #000000',
                    borderRadius: '8px',
                    color: '#000000',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    textAlign: 'center'
                  }}
                  placeholder="0.01"
                />
                <div style={{
                  position: 'absolute',
                  right: '15px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#000000',
                  fontSize: '18px',
                  fontWeight: 'bold'
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <button
                    onClick={() => setSelectedSide(Side.Up)}
                    style={{
                      backgroundColor: selectedSide === Side.Up ? '#16a34a' : '#dcfce7',
                      color: selectedSide === Side.Up ? '#ffffff' : '#15803d',
                      border: '3px solid #000000',
                      padding: '30px 20px',
                      fontSize: '20px',
                      fontWeight: 'bold',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      minHeight: '140px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px'
                    }}
                  >
                    <span style={{ fontSize: '40px' }}>📈</span>
                    <span style={{ fontSize: '24px' }}>UP</span>
                    <span style={{ fontSize: '14px' }}>Price RISE</span>
                  </button>
                  <button
                    onClick={() => setSelectedSide(Side.Down)}
                    style={{
                      backgroundColor: selectedSide === Side.Down ? '#dc2626' : '#fee2e2',
                      color: selectedSide === Side.Down ? '#ffffff' : '#b91c1c',
                      border: '3px solid #000000',
                      padding: '30px 20px',
                      fontSize: '20px',
                      fontWeight: 'bold',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      minHeight: '140px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px'
                    }}
                  >
                    <span style={{ fontSize: '40px' }}>📉</span>
                    <span style={{ fontSize: '24px' }}>DOWN</span>
                    <span style={{ fontSize: '14px' }}>Price FALL</span>
                  </button>
                </div>
              
              {selectedSide && (
                <div style={{
                  textAlign: 'center',
                  marginTop: '20px',
                  padding: '20px',
                  backgroundColor: '#ffffff',
                  border: '2px solid #000000',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: '#000000',
                    marginBottom: '5px'
                  }}>
                    ✅ You selected: {selectedSide === Side.Up ? '📈 UP' : '📉 DOWN'}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#000000'
                  }}>
                    You predict the price will {selectedSide === Side.Up ? 'RISE' : 'FALL'}
                  </div>
                </div>
              )}
            </div>

            {/* Place Bet Button */}
            <div style={{ paddingTop: '30px' }}>
              <button
                onClick={placeBet}
                disabled={!selectedSide || isPlacingBet}
                style={{
                  width: '100%',
                  backgroundColor: (!selectedSide || isPlacingBet) ? '#666666' : '#000000',
                  color: '#ffffff',
                  border: '3px solid #000000',
                  padding: '25px',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  borderRadius: '10px',
                  cursor: (!selectedSide || isPlacingBet) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px'
                }}
              >
                {isPlacingBet ? (
                  <>
                    <span>⏳</span>
                    <span>PLACING BET...</span>
                  </>
                ) : (
                  <>
                    <span>🎲</span>
                    <span>PLACE BET NOW</span>
                    <span>🚀</span>
                  </>
                )}
              </button>
              
              {(!selectedSide || !betAmount) && (
                <div style={{
                  textAlign: 'center',
                  marginTop: '20px',
                  backgroundColor: '#ffffff',
                  border: '2px solid #000000',
                  borderRadius: '8px',
                  padding: '15px'
                }}>
                  <p style={{
                    color: '#000000',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    margin: '0'
                  }}>
                    ⚠️ {!selectedSide ? 'Please select UP or DOWN first!' : 'Please enter bet amount!'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Round Schedule Info */}
      <div className="glass-card p-6 border border-indigo-500/50 bg-indigo-900/20">
        <div className="text-center">
          <Clock className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
          <h4 className="text-lg font-semibold text-indigo-300 mb-4">Round Schedule</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className={`p-3 rounded-lg border ${noActiveRound 
              ? 'bg-gray-900/30 border-gray-600/50' 
              : 'bg-orange-900/30 border-orange-600/50'
            }`}>
              <div className={`font-semibold ${noActiveRound ? 'text-gray-300' : 'text-orange-300'}`}>
                {`Round #${currentRoundNumber} (Current)`}
              </div>
              <div className={noActiveRound ? 'text-gray-200' : 'text-orange-200'}>
                {noActiveRound ? 'Ended: Top of hour' : 'Ends: Top of next hour'}
              </div>
              <div className={noActiveRound ? 'text-gray-200' : 'text-orange-200'}>
                Status: {noActiveRound ? '✅ Completed' : '🔴 Active & Running'}
              </div>
            </div>
            <div className="bg-green-900/30 p-3 rounded-lg border border-green-600/50">
              <div className="text-green-300 font-semibold">{`Round #${nextRoundNumber} (Next)`}</div>
              <div className="text-green-200">Starts: Top of next hour</div>
              <div className="text-green-200">Status: 🟢 Accepting Bets</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

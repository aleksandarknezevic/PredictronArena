import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useTheme } from '../contexts/ThemeContext';
import apolloClient from '../graphql/client';
import { GET_ALL_ROUNDS, GET_LEADERBOARD, GET_AI_STATS, GET_RECENT_ACTIVITY } from '../graphql/queries';
import { SEPOLIA_CHAIN_ID } from '../contracts/PredictronArena';
import { ethers } from 'ethers';
import { 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, 
  Activity, 
  Users, 
  DollarSign,
  BarChart3,
  PieChart as PieChartIcon,
  Brain,
  Target,
  AlertCircle,
  Zap,
  Clock,
  ArrowUpCircle,
  ArrowDownCircle
} from 'lucide-react';

interface AnalyticsData {
  totalVolume: bigint;
  totalRounds: number;
  activeUsers: number;
  avgBetSize: bigint;
  upBetPercentage: number;
  downBetPercentage: number;
  winPercentage: number;
  lossPercentage: number;
  tiePercentage: number;
}

export const AnalyticsTab: React.FC = () => {
  const { chainId, isConnected } = useWeb3();
  const { theme } = useTheme();
  
  // Theme-aware colors
  const colors = {
    cardBg: theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' : 'rgba(255, 255, 255, 0.9)',
    cardBorder: theme === 'dark' ? 'rgba(75, 85, 99, 0.5)' : 'rgba(209, 213, 219, 0.8)',
    text: theme === 'dark' ? '#ffffff' : '#111827',
    textSecondary: theme === 'dark' ? '#9ca3af' : '#6b7280',
    chartBg: theme === 'dark' ? 'rgba(17, 24, 39, 0.4)' : 'rgba(249, 250, 251, 0.9)',
  };
  
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [volumeData, setVolumeData] = useState<any[]>([]);
  const [resultData, setResultData] = useState<any[]>([]);
  const [poolData, setPoolData] = useState<any[]>([]);
  const [poolSizeTrends, setPoolSizeTrends] = useState<any[]>([]);
  const [participationTrends, setParticipationTrends] = useState<any[]>([]);
  const [aiAccuracyData, setAiAccuracyData] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [queryTime, setQueryTime] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  const fetchAnalytics = async () => {
    // Analytics can be viewed without wallet connection
    // Just verify we're on the right chain if connected
    if (isConnected && chainId !== SEPOLIA_CHAIN_ID) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const startTime = performance.now();

      // Fetch all data in parallel for maximum speed
      const [roundsResult, aiStatsResult, leaderboardResult, activityResult] = await Promise.all([
        apolloClient.query({
          query: GET_ALL_ROUNDS,
          variables: { chainId: SEPOLIA_CHAIN_ID, limit: 100 },
          fetchPolicy: 'network-only',
        }),
        apolloClient.query({
          query: GET_AI_STATS,
          variables: { chainId: SEPOLIA_CHAIN_ID.toString() },
          fetchPolicy: 'network-only',
        }),
        apolloClient.query({
          query: GET_LEADERBOARD,
          variables: { chainId: SEPOLIA_CHAIN_ID, limit: 1000 },
          fetchPolicy: 'network-only',
        }),
        apolloClient.query({
          query: GET_RECENT_ACTIVITY,
          variables: { chainId: SEPOLIA_CHAIN_ID, limit: 15 },
          fetchPolicy: 'network-only',
        }),
      ]);

      const endTime = performance.now();
      setQueryTime(Math.round(endTime - startTime));
      setLastUpdated(new Date());

      const rounds = roundsResult.data?.Round || [];
      const aiStats = aiStatsResult.data?.AiStats?.[0] || null;
      const activeUsers = leaderboardResult.data?.LeaderboardRow?.length || 0;
      const activity = activityResult.data?.UserRound || [];
      
      setRecentActivity(activity);

      // Calculate analytics
      let totalVolume = 0n;
      let totalUp = 0n;
      let totalDown = 0n;
      let winCount = 0;
      let lossCount = 0;
      let tieCount = 0;

      // Volume chart data (group by batches of rounds)
      const volumeChartData: any[] = [];
      const poolSizeTrendsData: any[] = [];
      const participationTrendsData: any[] = [];
      const batchSize = 5; // Group every 5 rounds
      
      for (let i = 0; i < rounds.length; i += batchSize) {
        const batch = rounds.slice(i, i + batchSize);
        const batchVolume = batch.reduce((sum: bigint, r: any) => 
          sum + BigInt(r.totalUp || 0) + BigInt(r.totalDown || 0), 0n
        );
        const avgPoolSize = batchVolume / BigInt(batch.length);
        const avgRound = Math.floor(batch.reduce((sum: number, r: any) => sum + parseInt(r.roundId), 0) / batch.length);
        
        // Count unique participants in this batch
        const uniqueParticipants = new Set<string>();
        batch.forEach((round: any) => {
          if (round.participants && round.participants.length > 0) {
            const users = round.participants.split(',').filter((u: string) => u.trim().length > 0);
            users.forEach((user: string) => uniqueParticipants.add(user.toLowerCase().trim()));
          }
        });
        
        // Fallback: if no participants data, estimate from activity data
        if (uniqueParticipants.size === 0 && activity.length > 0) {
          const batchStart = Math.min(...batch.map((r: any) => parseInt(r.roundId)));
          const batchEnd = Math.max(...batch.map((r: any) => parseInt(r.roundId)));
          activity.forEach((bet: any) => {
            const betRound = parseInt(bet.roundId);
            if (betRound >= batchStart && betRound <= batchEnd) {
              uniqueParticipants.add(bet.user.toLowerCase().trim());
            }
          });
        }
        
        volumeChartData.push({
          roundRange: `#${avgRound - 2}-${avgRound + 2}`,
          volume: parseFloat(ethers.formatEther(batchVolume)),
        });
        
        poolSizeTrendsData.push({
          roundRange: `#${avgRound - 2}-${avgRound + 2}`,
          poolSize: parseFloat(ethers.formatEther(avgPoolSize)),
          round: avgRound,
        });
        
        participationTrendsData.push({
          roundRange: `#${avgRound - 2}-${avgRound + 2}`,
          players: uniqueParticipants.size,
          round: avgRound,
        });
      }

      // Process rounds for analytics
      rounds.forEach((round: any) => {
        const up = BigInt(round.totalUp || 0);
        const down = BigInt(round.totalDown || 0);
        totalVolume += up + down;
        totalUp += up;
        totalDown += down;

        // Count results
        if (round.result === 1) winCount++;
        else if (round.result === 2) lossCount++;
        else if (round.result === 0) tieCount++;
      });

      const avgBetSize = rounds.length > 0 ? totalVolume / BigInt(rounds.length) : 0n;
      const upPercentage = Number(totalUp) > 0 ? (Number(totalUp) / Number(totalVolume)) * 100 : 50;
      const downPercentage = Number(totalDown) > 0 ? (Number(totalDown) / Number(totalVolume)) * 100 : 50;

      setAnalyticsData({
        totalVolume,
        totalRounds: rounds.length,
        activeUsers,
        avgBetSize,
        upBetPercentage: upPercentage,
        downBetPercentage: downPercentage,
        winPercentage: rounds.length > 0 ? (winCount / rounds.length) * 100 : 0,
        lossPercentage: rounds.length > 0 ? (lossCount / rounds.length) * 100 : 0,
        tiePercentage: rounds.length > 0 ? (tieCount / rounds.length) * 100 : 0,
      });

      // Set chart data
      setVolumeData(volumeChartData.reverse());
      setPoolSizeTrends(poolSizeTrendsData.reverse());
      setParticipationTrends(participationTrendsData.reverse());
      
      setResultData([
        { name: 'UP Won', value: winCount, color: '#22c55e' },
        { name: 'DOWN Won', value: lossCount, color: '#ef4444' },
        { name: 'TIE', value: tieCount, color: '#f59e0b' },
      ]);

      setPoolData([
        { name: 'UP Bets', value: parseFloat(ethers.formatEther(totalUp)), color: '#22c55e' },
        { name: 'DOWN Bets', value: parseFloat(ethers.formatEther(totalDown)), color: '#ef4444' },
      ]);

      if (aiStats) {
        setAiAccuracyData({
          accuracy: (aiStats.accuracy * 100).toFixed(1),
          correct: aiStats.correct,
          incorrect: aiStats.incorrect,
          total: aiStats.roundsWithPrediction,
        });
      }

    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch analytics regardless of connection status
    // Only skip if connected to wrong network
    if (!isConnected || (isConnected && chainId === SEPOLIA_CHAIN_ID)) {
      fetchAnalytics();
    }
  }, [isConnected, chainId]);

  // Auto-refresh every 1 minute (60 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      if (!isConnected || (isConnected && chainId === SEPOLIA_CHAIN_ID)) {
        fetchAnalytics();
      }
    }, 60000); // 60 seconds (1 minute)

    return () => clearInterval(interval);
  }, [isConnected, chainId, autoRefresh]);

  // Force re-render every second to update "time since" display
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(tick => tick + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatEther = (wei: bigint) => {
    return parseFloat(ethers.formatEther(wei)).toFixed(3);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getTimeSinceUpdate = () => {
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  // Custom label renderer for pie charts - shows percentage
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    // Only show label if percentage is > 5% (to avoid cluttering small slices)
    if (percent < 0.05) return null;

    return (
      <text 
        x={x} 
        y={y} 
        fill={theme === 'dark' ? '#ffffff' : '#111827'}
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        style={{ 
          fontSize: '0.875rem', 
          fontWeight: '700',
          stroke: theme === 'dark' ? '#000000' : '#ffffff',
          strokeWidth: '2px',
          paintOrder: 'stroke fill'
        }}
      >
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  // Custom label renderer for ETH amounts
  const renderEthLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    // Only show label if percentage is > 5%
    if (percent < 0.05) return null;

    return (
      <g>
        <text 
          x={x} 
          y={y - 8} 
          fill={theme === 'dark' ? '#ffffff' : '#111827'}
          textAnchor={x > cx ? 'start' : 'end'} 
          dominantBaseline="central"
          style={{ 
            fontSize: '0.875rem', 
            fontWeight: '700',
            stroke: theme === 'dark' ? '#000000' : '#ffffff',
            strokeWidth: '2px',
            paintOrder: 'stroke fill'
          }}
        >
          {`${(percent * 100).toFixed(1)}%`}
        </text>
        <text 
          x={x} 
          y={y + 8} 
          fill={theme === 'dark' ? '#ffffff' : '#111827'}
          textAnchor={x > cx ? 'start' : 'end'} 
          dominantBaseline="central"
          style={{ 
            fontSize: '0.75rem', 
            fontWeight: '600',
            stroke: theme === 'dark' ? '#000000' : '#ffffff',
            strokeWidth: '2px',
            paintOrder: 'stroke fill'
          }}
        >
          {`${value.toFixed(3)} ETH`}
        </text>
      </g>
    );
  };

  // Only show network error if connected to wrong network
  if (isConnected && chainId !== SEPOLIA_CHAIN_ID) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2" style={{ color: colors.text }}>Wrong Network</h3>
        <p style={{ color: colors.textSecondary }}>Please switch to Sepolia testnet to view analytics</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-400 border-t-transparent mx-auto mb-4"></div>
        <h3 className="text-xl font-semibold mb-2" style={{ color: colors.text }}>Loading Analytics...</h3>
        <p style={{ color: colors.textSecondary }}>Fetching protocol data</p>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center py-12">
        <Activity className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2" style={{ color: colors.text }}>No Data Available</h3>
        <p style={{ color: colors.textSecondary }}>No rounds have been completed yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Live Status & Performance Bar */}
      <div style={{
        backgroundColor: colors.cardBg,
        border: `2px solid ${theme === 'dark' ? '#22c55e' : '#16a34a'}`,
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '0.625rem',
              height: '0.625rem',
              borderRadius: '50%',
              backgroundColor: '#22c55e',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }} />
            <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#22c55e' }}>
              🟢 LIVE
            </span>
          </div>
          <div style={{ height: '1.25rem', width: '1px', backgroundColor: colors.cardBorder }} />
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.375rem',
            padding: '0.25rem 0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)',
            border: `1px solid ${theme === 'dark' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)'}`
          }}>
            <Zap style={{ width: '1.125rem', height: '1.125rem', color: '#f59e0b' }} />
            <span style={{ fontSize: '0.875rem', color: colors.text, fontWeight: '600' }}>
              Envio Query:
            </span>
            <span style={{ 
              fontSize: '1rem', 
              color: '#f59e0b', 
              fontWeight: '900',
              fontFamily: 'monospace'
            }}>
              {queryTime}ms
            </span>
            <span style={{ fontSize: '0.7rem', color: colors.textSecondary, fontWeight: '600' }}>
              ⚡ BLAZING FAST
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Clock style={{ width: '0.875rem', height: '0.875rem', color: colors.textSecondary }} />
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary, fontStyle: 'italic' }}>
              Updated {getTimeSinceUpdate()}
            </span>
          </div>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.25rem 0.625rem',
              borderRadius: '0.375rem',
              border: `1px solid ${autoRefresh ? (theme === 'dark' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.3)') : (theme === 'dark' ? 'rgba(107, 114, 128, 0.4)' : 'rgba(107, 114, 128, 0.3)')}`,
              backgroundColor: autoRefresh ? (theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)') : (theme === 'dark' ? 'rgba(55, 65, 81, 0.3)' : 'rgba(148, 163, 184, 0.2)'),
              color: autoRefresh ? '#22c55e' : colors.textSecondary,
              fontSize: '0.7rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Activity style={{ width: '0.75rem', height: '0.75rem' }} />
            {autoRefresh ? 'Auto-refresh: 60s' : 'Auto-refresh: OFF'}
          </button>
        </div>
      </div>

      {/* Protocol Overview Stats */}
      <div style={{
        backgroundColor: colors.cardBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: '0.5rem',
        padding: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Activity style={{ width: '1.25rem', height: '1.25rem', color: '#6366f1' }} />
          <span style={{ fontSize: '1rem', fontWeight: '700', color: colors.text }}>PROTOCOL OVERVIEW</span>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <DollarSign style={{ width: '1.5rem', height: '1.5rem', color: '#3b82f6', margin: '0 auto 0.25rem' }} />
            <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#3b82f6', fontFamily: 'monospace' }}>
              {formatEther(analyticsData.totalVolume)}
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Total Volume (ETH)</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <BarChart3 style={{ width: '1.5rem', height: '1.5rem', color: '#8b5cf6', margin: '0 auto 0.25rem' }} />
            <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#8b5cf6' }}>
              {analyticsData.totalRounds}
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Total Rounds</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <Users style={{ width: '1.5rem', height: '1.5rem', color: '#22c55e', margin: '0 auto 0.25rem' }} />
            <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#22c55e' }}>
              {analyticsData.activeUsers}
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Active Users</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <Target style={{ width: '1.5rem', height: '1.5rem', color: '#f59e0b', margin: '0 auto 0.25rem' }} />
            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#f59e0b', fontFamily: 'monospace' }}>
              {formatEther(analyticsData.avgBetSize)}
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Avg Pool Size (ETH)</div>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div style={{
        backgroundColor: colors.cardBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: '0.5rem',
        padding: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Activity style={{ width: '1.25rem', height: '1.25rem', color: '#3b82f6' }} />
          <span style={{ fontSize: '1rem', fontWeight: '700', color: colors.text }}>RECENT ACTIVITY</span>
          <span style={{ 
            fontSize: '0.75rem', 
            padding: '0.125rem 0.5rem', 
            borderRadius: '0.25rem', 
            backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
            color: '#3b82f6',
            fontWeight: '600'
          }}>
            LIVE
          </span>
        </div>
        
        <div style={{ 
          maxHeight: '280px', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          {recentActivity.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem',
              color: colors.textSecondary 
            }}>
              No recent activity
            </div>
          ) : (
            recentActivity.map((bet: any, index: number) => {
              const isUp = bet.side === 1 || (bet.upAmount && BigInt(bet.upAmount) > 0n);
              const amount = BigInt(bet.totalBet || bet.upAmount || bet.downAmount || 0);
              
              return (
                <div 
                  key={bet.id || index}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.625rem 0.75rem',
                    borderRadius: '0.375rem',
                    backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.5)' : 'rgba(249, 250, 251, 0.8)',
                    border: `1px solid ${isUp ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    {isUp ? (
                      <ArrowUpCircle style={{ width: '1.25rem', height: '1.25rem', color: '#22c55e' }} />
                    ) : (
                      <ArrowDownCircle style={{ width: '1.25rem', height: '1.25rem', color: '#ef4444' }} />
                    )}
                    <div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '600',
                        color: colors.text,
                        fontFamily: 'monospace'
                      }}>
                        {formatAddress(bet.user)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>
                        Round #{bet.roundId}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: '700',
                      color: isUp ? '#22c55e' : '#ef4444',
                      fontFamily: 'monospace'
                    }}>
                      {parseFloat(ethers.formatEther(amount)).toFixed(4)} ETH
                    </div>
                    <div style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: '600',
                      color: isUp ? '#22c55e' : '#ef4444'
                    }}>
                      {isUp ? 'UP' : 'DOWN'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Volume Chart */}
        <div style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <TrendingUp style={{ width: '1rem', height: '1rem', color: '#3b82f6' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: '700', color: colors.text }}>BETTING VOLUME</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#d1d5db'} />
              <XAxis 
                dataKey="roundRange" 
                stroke={colors.textSecondary}
                style={{ fontSize: '0.75rem' }}
              />
              <YAxis 
                stroke={colors.textSecondary}
                style={{ fontSize: '0.75rem' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: colors.cardBg, 
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: '0.375rem',
                  color: colors.text
                }}
                formatter={(value: any) => [`${value.toFixed(3)} ETH`, 'Volume']}
              />
              <Bar dataKey="volume" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pool Size Trends */}
        <div style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <DollarSign style={{ width: '1rem', height: '1rem', color: '#10b981' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: '700', color: colors.text }}>POOL SIZE TRENDS</span>
            <span style={{ 
              fontSize: '0.65rem', 
              padding: '0.125rem 0.375rem', 
              borderRadius: '0.25rem', 
              backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              fontWeight: '600'
            }}>
              AVG
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={poolSizeTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#d1d5db'} />
              <XAxis 
                dataKey="roundRange" 
                stroke={colors.textSecondary}
                style={{ fontSize: '0.75rem' }}
              />
              <YAxis 
                stroke={colors.textSecondary}
                style={{ fontSize: '0.75rem' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: colors.cardBg, 
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: '0.375rem',
                  color: colors.text
                }}
                formatter={(value: any) => [`${value.toFixed(4)} ETH`, 'Avg Pool']}
              />
              <Line 
                type="monotone" 
                dataKey="poolSize" 
                stroke="#10b981" 
                strokeWidth={3}
                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Round Results Pie Chart */}
        <div style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <PieChartIcon style={{ width: '1rem', height: '1rem', color: '#22c55e' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: '700', color: colors.text }}>ROUND RESULTS</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={resultData}
                cx="50%"
                cy="45%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={70}
                fill="#8884d8"
                dataKey="value"
              >
                {resultData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: colors.cardBg, 
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: '0.375rem',
                  color: colors.text
                }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                wrapperStyle={{
                  fontSize: '0.75rem',
                  color: colors.text
                }}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Pool Distribution Pie Chart */}
        <div style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <PieChartIcon style={{ width: '1rem', height: '1rem', color: '#8b5cf6' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: '700', color: colors.text }}>BET DISTRIBUTION</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={poolData}
                cx="50%"
                cy="45%"
                labelLine={false}
                label={renderEthLabel}
                outerRadius={70}
                fill="#8884d8"
                dataKey="value"
              >
                {poolData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: colors.cardBg, 
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: '0.375rem',
                  color: colors.text
                }}
                formatter={(value: any) => [`${value.toFixed(3)} ETH`, '']}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                wrapperStyle={{
                  fontSize: '0.75rem',
                  color: colors.text
                }}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* AI Accuracy Stats */}
        {aiAccuracyData && (
          <div style={{
            backgroundColor: colors.cardBg,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Brain style={{ width: '1rem', height: '1rem', color: '#a855f7' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: '700', color: colors.text }}>AI PREDICTIONS</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', fontWeight: '900', color: '#a855f7' }}>
                  {aiAccuracyData.accuracy}%
                </div>
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>Accuracy</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#22c55e' }}>
                    {aiAccuracyData.correct}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Correct</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ef4444' }}>
                    {aiAccuracyData.incorrect}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Wrong</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#3b82f6' }}>
                    {aiAccuracyData.total}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Total</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Participation Trends */}
        <div style={{
          backgroundColor: colors.cardBg,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Users style={{ width: '1rem', height: '1rem', color: '#06b6d4' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: '700', color: colors.text }}>USER PARTICIPATION</span>
            <span style={{ 
              fontSize: '0.65rem', 
              padding: '0.125rem 0.375rem', 
              borderRadius: '0.25rem', 
              backgroundColor: theme === 'dark' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(6, 182, 212, 0.1)',
              color: '#06b6d4',
              fontWeight: '600'
            }}>
              GROWTH
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={participationTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#d1d5db'} />
              <XAxis 
                dataKey="roundRange" 
                stroke={colors.textSecondary}
                style={{ fontSize: '0.75rem' }}
              />
              <YAxis 
                stroke={colors.textSecondary}
                style={{ fontSize: '0.75rem' }}
                allowDecimals={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: colors.cardBg, 
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: '0.375rem',
                  color: colors.text
                }}
                formatter={(value: any) => [`${value} players`, 'Active']}
              />
              <Line 
                type="monotone" 
                dataKey="players" 
                stroke="#06b6d4" 
                strokeWidth={3}
                dot={{ fill: '#06b6d4', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Powered by Envio Badge */}
      <div style={{
        backgroundColor: colors.cardBg,
        border: `2px solid ${theme === 'dark' ? '#6366f1' : '#818cf8'}`,
        borderRadius: '0.5rem',
        padding: '1rem',
        textAlign: 'center',
        background: theme === 'dark' 
          ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)'
          : 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <Zap style={{ width: '1.5rem', height: '1.5rem', color: '#6366f1' }} />
          <div>
            <div style={{ fontSize: '0.875rem', color: colors.textSecondary, marginBottom: '0.125rem' }}>
              Real-time indexing powered by
            </div>
            <a
              href="https://envio.dev"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '1.5rem',
                fontWeight: '900',
                background: 'linear-gradient(to right, #6366f1, #8b5cf6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textDecoration: 'none',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              ENVIO HYPERINDEX
            </a>
          </div>
          <Zap style={{ width: '1.5rem', height: '1.5rem', color: '#8b5cf6' }} />
        </div>
        <div style={{ 
          fontSize: '0.75rem', 
          color: colors.textSecondary,
          marginTop: '0.5rem',
          fontStyle: 'italic'
        }}>
          ⚡ Sub-second queries • Real-time updates • Lightning-fast sync
        </div>
      </div>
    </div>
  );
};


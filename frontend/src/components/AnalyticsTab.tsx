import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useTheme } from '../contexts/ThemeContext';
import apolloClient from '../graphql/client';
import { GET_ALL_ROUNDS, GET_LEADERBOARD, GET_AI_STATS } from '../graphql/queries';
import { SEPOLIA_CHAIN_ID } from '../contracts/PredictronArena';
import { ethers } from 'ethers';
import { 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
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
  Zap
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
  const [aiAccuracyData, setAiAccuracyData] = useState<any>(null);

  const fetchAnalytics = async () => {
    // Analytics can be viewed without wallet connection
    // Just verify we're on the right chain if connected
    if (isConnected && chainId !== SEPOLIA_CHAIN_ID) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch all rounds
      const roundsResult = await apolloClient.query({
        query: GET_ALL_ROUNDS,
        variables: { chainId: SEPOLIA_CHAIN_ID, limit: 100 },
        fetchPolicy: 'network-only',
      });

      // Fetch AI stats
      const aiStatsResult = await apolloClient.query({
        query: GET_AI_STATS,
        variables: { chainId: SEPOLIA_CHAIN_ID.toString() },
        fetchPolicy: 'network-only',
      });

      // Fetch leaderboard for active users count
      const leaderboardResult = await apolloClient.query({
        query: GET_LEADERBOARD,
        variables: { chainId: SEPOLIA_CHAIN_ID, limit: 1000 },
        fetchPolicy: 'network-only',
      });

      const rounds = roundsResult.data?.Round || [];
      const aiStats = aiStatsResult.data?.AiStats?.[0] || null;
      const activeUsers = leaderboardResult.data?.LeaderboardRow?.length || 0;

      // Calculate analytics
      let totalVolume = 0n;
      let totalUp = 0n;
      let totalDown = 0n;
      let winCount = 0;
      let lossCount = 0;
      let tieCount = 0;

      // Volume chart data (group by batches of rounds)
      const volumeChartData: any[] = [];
      const batchSize = 5; // Group every 5 rounds
      
      for (let i = 0; i < rounds.length; i += batchSize) {
        const batch = rounds.slice(i, i + batchSize);
        const batchVolume = batch.reduce((sum: bigint, r: any) => 
          sum + BigInt(r.totalUp || 0) + BigInt(r.totalDown || 0), 0n
        );
        const avgRound = Math.floor(batch.reduce((sum: number, r: any) => sum + parseInt(r.roundId), 0) / batch.length);
        
        volumeChartData.push({
          roundRange: `#${avgRound - 2}-${avgRound + 2}`,
          volume: parseFloat(ethers.formatEther(batchVolume)),
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

  const formatEther = (wei: bigint) => {
    return parseFloat(ethers.formatEther(wei)).toFixed(3);
  };

  // Custom label renderer for pie charts with proper visibility
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

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
        {`${name} ${(percent * 100).toFixed(0)}%`}
      </text>
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
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={resultData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={80}
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
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={poolData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={80}
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


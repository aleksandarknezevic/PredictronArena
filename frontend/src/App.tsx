import { Web3Provider } from './contexts/Web3Context';
import { Header } from './components/Header';
import { PlayTab } from './components/PlayTab';
import { HistoryTab } from './components/HistoryTab';
import { StatsTab } from './components/StatsTab';
import { useState } from 'react';

function App() {
  const [activeTab, setActiveTab] = useState('play');

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'play':
        return <PlayTab />;
      case 'history':
        return <HistoryTab />;
      case 'stats':
        return <StatsTab />;
      default:
        return <PlayTab />;
    }
  };

  return (
    <Web3Provider>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        {/* Neural network background pattern */}
        <div className="fixed inset-0 neural-background opacity-10 pointer-events-none" />
        
        {/* Main content */}
        <div className="relative z-10">
          <Header />
          
          <main className="container mx-auto px-4 py-8">
            <div className="max-w-6xl mx-auto">
              {/* Tagline */}
              <div className="text-center mb-8">
                <p className="text-lg text-gray-300 max-w-2xl mx-auto font-mono">
                  Challenge the AI in price prediction battles. 
                  <span className="text-indigo-400 font-semibold"> Bet on ETH price movements</span> and 
                  <span className="text-purple-400 font-semibold"> compete against neural networks</span>.
                </p>
              </div>

          {/* Modern Tabs */}
          <div style={{
            backgroundColor: 'rgba(31, 41, 55, 0.6)',
            border: '1px solid rgba(75, 85, 99, 0.5)',
            borderRadius: '0.75rem',
            padding: '0.5rem',
            marginBottom: '2rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <button 
                onClick={() => setActiveTab('play')}
                style={{
                  backgroundColor: activeTab === 'play' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  color: '#ffffff',
                  border: activeTab === 'play' ? '2px solid #6366f1' : '2px solid transparent',
                  padding: '1rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '900',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== 'play') {
                    e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== 'play') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>🎮</span>
                <span>Play</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('history')}
                style={{
                  backgroundColor: activeTab === 'history' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  color: '#ffffff',
                  border: activeTab === 'history' ? '2px solid #6366f1' : '2px solid transparent',
                  padding: '1rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '900',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== 'history') {
                    e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== 'history') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>📊</span>
                <span>History</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('stats')}
                style={{
                  backgroundColor: activeTab === 'stats' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  color: '#ffffff',
                  border: activeTab === 'stats' ? '2px solid #6366f1' : '2px solid transparent',
                  padding: '1rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '900',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== 'stats') {
                    e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== 'stats') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>📈</span>
                <span>Stats</span>
              </button>
            </div>
          </div>

              {/* Tab Content */}
              <div className="min-h-[600px]">
                {renderActiveTab()}
              </div>
            </div>
          </main>
        </div>
      </div>
    </Web3Provider>
  );
}

export default App;
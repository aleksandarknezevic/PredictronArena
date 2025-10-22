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

          {/* WORKING TABS - BIG AND CLICKABLE */}
          <div className="bg-gray-800/70 p-4 rounded-2xl border-2 border-gray-600 mb-12 shadow-2xl">
            <div className="grid grid-cols-3 gap-4">
              <button 
                onClick={() => setActiveTab('play')}
                style={{
                  backgroundColor: activeTab === 'play' ? '#4a5568' : '#ffffff',
                  color: activeTab === 'play' ? '#ffffff' : '#000000',
                  border: '3px solid #000000',
                  padding: '20px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  minHeight: '100px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span style={{ fontSize: '24px' }}>🎮</span>
                <span>PLAY</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('history')}
                style={{
                  backgroundColor: activeTab === 'history' ? '#4a5568' : '#ffffff',
                  color: activeTab === 'history' ? '#ffffff' : '#000000',
                  border: '3px solid #000000',
                  padding: '20px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  minHeight: '100px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span style={{ fontSize: '24px' }}>📊</span>
                <span>HISTORY</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('stats')}
                style={{
                  backgroundColor: activeTab === 'stats' ? '#4a5568' : '#ffffff',
                  color: activeTab === 'stats' ? '#ffffff' : '#000000',
                  border: '3px solid #000000',
                  padding: '20px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  minHeight: '100px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span style={{ fontSize: '24px' }}>📈</span>
                <span>STATS</span>
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
import { useWeb3 } from '../contexts/Web3Context';

export function Header() {
  const { account, connectWallet, disconnectWallet, isConnecting } = useWeb3();

  return (
    <header className="bg-gray-800/80 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between relative">
          {/* Logo on Left */}
          <div className="flex items-center">
            <img src="/logo.svg" alt="Predictron Arena Logo" className="w-12 h-12" />
          </div>

          {/* Centered Title */}
          <div className="absolute left-1/2 transform -translate-x-1/2 z-10">
            <h1 className="text-3xl font-bold whitespace-nowrap" style={{
              background: 'linear-gradient(to right, rgb(192, 132, 252), rgb(129, 140, 248), rgb(96, 165, 250))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              Predictron Arena
            </h1>
          </div>

          {/* Connection Status on Right */}
          <div className="flex items-center space-x-4">
            {account ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 bg-green-500/20 px-3 py-2 rounded-lg border border-green-500/30">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-green-400 text-sm font-mono">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg transition-colors duration-200 text-sm font-medium"
                >
                  Disconnect
                </button>
              </div>
            ) : (
        <button
          onClick={connectWallet}
          disabled={isConnecting}
          style={{
            backgroundColor: '#ff0000',
            color: '#ffffff',
            padding: '12px 24px',
            fontSize: '18px',
            fontWeight: 'bold',
            border: '3px solid #00ff00',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isConnecting ? (
              <>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid white',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span style={{ color: 'white', fontWeight: 'bold' }}>Connecting...</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '24px' }}>🦊</span>
                <span style={{ color: 'white', fontWeight: 'bold' }}>CONNECT METAMASK</span>
              </>
            )}
          </div>
        </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

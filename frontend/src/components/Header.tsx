import { useWeb3 } from '../contexts/Web3Context';
import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export function Header() {
  const { account, connectWallet, disconnectWallet, isConnecting } = useWeb3();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-card backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50 compact-padding">
      <div className="container mx-auto px-4 py-4">
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

          {/* Connection Status and Theme Toggle on Right */}
          <div className="flex items-center space-x-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              style={{
                padding: '0.75rem',
                backgroundColor: '#374151',
                border: '2px solid #4b5563',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun style={{ width: '1.25rem', height: '1.25rem', color: '#facc15' }} />
              ) : (
                <Moon style={{ width: '1.25rem', height: '1.25rem', color: '#818cf8' }} />
              )}
            </button>

            {account ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  backgroundColor: '#166534',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '2px solid #22c55e'
                }}>
                  <div style={{ width: '8px', height: '8px', backgroundColor: '#4ade80', borderRadius: '50%', animation: 'pulse 2s infinite' }}></div>
                  <span style={{ color: '#86efac', fontSize: '0.875rem', fontWeight: '600' }}>
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={disconnectWallet}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#991b1b',
                    color: '#ffffff',
                    border: '2px solid #dc2626',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
        <button
          onClick={connectWallet}
          disabled={isConnecting}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#4f46e5',
            color: '#ffffff',
            border: '2px solid #6366f1',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: isConnecting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {isConnecting ? (
            <>
              <div style={{ width: '1rem', height: '1rem', border: '2px solid white', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.25rem' }}>🦊</span>
              <span>Connect Wallet</span>
            </>
          )}
        </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

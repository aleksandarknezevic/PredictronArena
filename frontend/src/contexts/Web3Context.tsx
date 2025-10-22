import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import detectEthereumProvider from '@metamask/detect-provider';
import { PREDICTRON_ARENA_ADDRESS, PREDICTRON_ARENA_ABI, SEPOLIA_CHAIN_ID } from '../contracts/PredictronArena';

interface Web3ContextType {
  provider: BrowserProvider | null;
  signer: ethers.Signer | null;
  contract: Contract | null;
  account: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchToSepolia: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | null>(null);

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
};

interface Web3ProviderProps {
  children: ReactNode;
}

export const Web3Provider: React.FC<Web3ProviderProps> = ({ children }) => {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeProvider = async (ethereumProvider: any) => {
    try {
      const browserProvider = new BrowserProvider(ethereumProvider);
      const network = await browserProvider.getNetwork();
      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();

      setProvider(browserProvider);
      setSigner(signer);
      setAccount(address);
      setChainId(Number(network.chainId));
      setIsConnected(true);

      // Initialize contract
      const contractInstance = new Contract(PREDICTRON_ARENA_ADDRESS, PREDICTRON_ARENA_ABI, signer);
      setContract(contractInstance);

      setError(null);
    } catch (err) {
      console.error('Failed to initialize provider:', err);
      setError('Failed to initialize wallet connection');
    }
  };

  const connectWallet = async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    setError(null);

    try {
      const ethereumProvider = await detectEthereumProvider();
      
      if (!ethereumProvider) {
        throw new Error('MetaMask not found. Please install MetaMask.');
      }

      // Request account access
      await (ethereumProvider as any).request({ method: 'eth_requestAccounts' });
      
      await initializeProvider(ethereumProvider);
    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setContract(null);
    setAccount(null);
    setChainId(null);
    setIsConnected(false);
    setError(null);
  };

  const switchToSepolia = async () => {
    if (!provider) return;

    try {
      await provider.send('wallet_switchEthereumChain', [
        { chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}` }
      ]);
    } catch (error: any) {
      // If the chain hasn't been added to MetaMask, add it
      if (error.code === 4902) {
        try {
          await provider.send('wallet_addEthereumChain', [
            {
              chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}`,
              chainName: 'Sepolia Testnet',
              nativeCurrency: {
                name: 'ETH',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://sepolia.infura.io/v3/'],
              blockExplorerUrls: ['https://sepolia.etherscan.io/'],
            },
          ]);
        } catch (addError) {
          console.error('Failed to add Sepolia network:', addError);
          setError('Failed to add Sepolia network');
        }
      } else {
        console.error('Failed to switch to Sepolia:', error);
        setError('Failed to switch to Sepolia network');
      }
    }
  };

  // Auto-connect if previously connected
  useEffect(() => {
    const autoConnect = async () => {
      try {
        const ethereumProvider = await detectEthereumProvider();
        if (ethereumProvider) {
          const accounts = await (ethereumProvider as any).request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            await initializeProvider(ethereumProvider);
          }
        }
      } catch (err) {
        console.error('Auto-connect failed:', err);
      }
    };

    autoConnect();
  }, []);

  // Listen for account and network changes
  useEffect(() => {
    if (!provider) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        // Reinitialize everything when account changes to ensure signer and contract are updated
        const ethereumProvider = (window as any).ethereum;
        if (ethereumProvider) {
          await initializeProvider(ethereumProvider);
        }
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const newChainId = parseInt(chainIdHex, 16);
      setChainId(newChainId);
      // Reload the page when network changes to reset the app state
      window.location.reload();
    };

    const ethereumProvider = (window as any).ethereum;
    if (ethereumProvider) {
      ethereumProvider.on('accountsChanged', handleAccountsChanged);
      ethereumProvider.on('chainChanged', handleChainChanged);

      return () => {
        ethereumProvider.removeListener('accountsChanged', handleAccountsChanged);
        ethereumProvider.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [provider]);

  const value: Web3ContextType = {
    provider,
    signer,
    contract,
    account,
    chainId,
    isConnected,
    isConnecting,
    error,
    connectWallet,
    disconnectWallet,
    switchToSepolia,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};

# Predictron Arena 🎯

### Decentralized Prediction Market | ETHGlobal Hackathon 2025

**Blockchain prediction game where you bet on ETH price movements. Predict UP or DOWN each round. Win ETH. Challenge the AI and other players!**

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-predictron--arena.vercel.app-blue?style=for-the-badge)](https://predictron-arena.vercel.app/)
[![Smart Contract](https://img.shields.io/badge/📜_Contract-Sepolia_Verified-green?style=for-the-badge)](https://sepolia.etherscan.io/address/0xe62fcb22480950aa6c9f49dc1057752e1add52c2)
[![Powered by Envio](https://img.shields.io/badge/⚡_Indexer-Envio_Hosted-purple?style=for-the-badge)](https://envio.dev)

---

## 🌐 Live Deployment

| Component | Status | Link |
|-----------|--------|------|
| **Frontend** | ✅ Live | [predictron-arena.vercel.app](https://predictron-arena.vercel.app/) |
| **Smart Contract** | ✅ Verified on Sepolia | [View on Etherscan](https://sepolia.etherscan.io/address/0xe62fcb22480950aa6c9f49dc1057752e1add52c2) |
| **Backend Indexer** | ✅ Envio Hosted | GraphQL API via Envio |
| **Network** | Ethereum Sepolia Testnet | Chain ID: 11155111 |

**🎮 Try it now:** Connect your MetaMask wallet to Sepolia and start playing!

---

## 🎯 What Is Predictron Arena?

**Predictron Arena** is a fully decentralized prediction market built on Ethereum, where users bet on ETH price movements in hourly rounds. It combines:
- 🎲 **Real-time betting** on price direction (UP/DOWN)
- 🤖 **AI competition** via Chainlink Functions
- 📊 **Advanced analytics** with Envio's blazing-fast indexer
- 💰 **Pool-based rewards** with transparent on-chain settlement

Think of it as a gamified prediction market where you compete against other players and an AI oracle to earn cryptocurrency rewards.

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Smart Contracts** | Solidity + Foundry | Core game logic, betting, rewards |
| **Blockchain** | Ethereum Sepolia | L1 settlement and execution |
| **Price Oracle** | Chainlink Price Feeds | Real-time ETH/USD data |
| **AI Oracle** | Chainlink Functions | Decentralized AI predictions |
| **AI Agent** | CloudFlare AI | CloudFlare AI agent |
| **Automation** | Chainlink Automation | Autonomous round management |
| **Indexer** | Envio HyperIndex | Sub-second data queries |
| **Backend Database** | PostgreSQL + Hasura | GraphQL API |
| **Frontend** | React + TypeScript + Vite | Modern web interface |
| **Styling** | Tailwind CSS | Responsive design |
| **State Management** | Apollo Client + Context API | Real-time data fetching |
| **Deployment** | Vercel (Frontend) + Envio (Backend) | Production hosting |

## Core Game Mechanics

### How Rounds Work
1. **Betting Phase**: Before a round starts, players place bets on the **next** round, predicting whether the price will go UP or DOWN
2. **Multiple Bets**: Players can place multiple bets on the same side, or hedge by betting on both UP and DOWN
3. **Round Starts**: When the round manager initiates the round (via Chainlink Automation), the starting ETH/USD price is recorded and betting closes
4. **Active Round**: The round runs for approximately **1 hour** (some delays for automation are expected at the begginign of round)
5. **Round Ends**: After the time interval, the final price is recorded and compared to the starting price
6. **Winner Determination**: 
   - If final price > start price: UP bets win
   - If final price < start price: DOWN bets win
   - If prices are equal: It's a tie (rare)
7. **New Round**: A new betting phase immediately begins for the next round, and the cycle repeats every hour

### Two-Round System
**Important**: The game operates with two parallel rounds at any given time:
- **Current Round**: The active round that is currently running (bets are closed, price is moving)
- **Next Round**: The upcoming round that is accepting bets (bets are open, round hasn't started)

This allows continuous gameplay - while one round is active, players can place bets on the next one!

### Betting & Rewards System
- **Placing Bets**: Users can bet any amount of ETH on UP or DOWN (or both) for the **next** round
- **Betting Window**: Bets can only be placed before a round starts; once started, betting closes for that round
- **Pool-Based Rewards**: All bets go into a shared pool. Winners split the entire pool proportionally based on their bet size
- **Protocol Fee**: 2% is taken as a protocol fee
- **Reward Calculation**: 
  - Your share = (Your winning bet / Total winning bets) × Total pool × (1 - protocol fee)
  - If you bet on both sides, only your winning side counts toward rewards
- **Claiming**: Winners must manually claim their rewards after each round ends

### The AI Opponent (Predictron)
- **Chainlink Integration**: The game features an AI oracle powered by Chainlink Functions and CloudFlare AI agent
- **AI Predictions**: When a new round is about to start, the AI makes its own UP or DOWN prediction for that round
- **Competition Tracking**: Players can see how well they perform compared to the AI over time
- **Implementation**: Uses Chainlink's decentralized oracle network to fetch AI predictions from CloudFront AI - could be any other AI using API

## Technical Architecture

### Smart Contracts (Solidity)
**Main Contract: PredictronArena.sol**
- **Round Management**: 
  - `startRound()`: Initiates a new round with current price
  - `endRound()`: Finalizes round with ending price and determines result
  - `currentRoundId`: Tracks the active round number
  
- **Betting Functions**:
  - `placeBet(side)`: Allows users to place UP or DOWN bets on the **next** round (before it starts)
  - Validates bet amount meets minimum and round hasn't started yet
  - Tracks total UP and DOWN amounts per round
  - Prevents betting once a round has started
  
- **Reward System**:
  - `claim(roundId)`: Allows winners to claim their rewards
  - `calculateReward(roundId, user)`: Calculates user's reward for a specific round
  - Prevents double-claiming with tracking
  
- **Price Oracle Integration**:
  - Uses Chainlink Price Feeds for reliable, tamper-proof price data
  - Stores start and end prices for each round
  
- **AI Oracle Integration**:
  - Chainlink Functions for fetching AI predictions
  - Stores AI prediction (UP/DOWN) for each round

- **Security Features**:
  - ReentrancyGuard to prevent reentrancy attacks
  - Pausable for emergency stops
  - Access control for admin functions

### Backend Indexer (Envio HyperIndex)
**Purpose**: Provides fast, queryable data without hitting the blockchain directly

**Key Components**:

1. **Event Handlers (EventHandlers.ts)**:
   - `RoundStarted`: Records new rounds with start price and timestamp
   - `BetPlaced`: Tracks all user bets, updates totals
   - `RoundEnded`: Records final price, determines winners, calculates all rewards
   - `RewardClaimed`: Marks rounds as claimed for users
   - `ExternalPredictionAdded`: Stores AI predictions

2. **Data Entities (schema.graphql)**:
   - **Round**: Stores round data (ID, prices, timestamps, totals, result, AI prediction)
   - **UserRound**: Tracks each user's bets and rewards per round (upAmount, downAmount, grossReward, netPnl, claimed, won)
   - **User**: Aggregates user statistics (total bets, wins, losses, total P&L)
   - **GlobalStats**: Tracks overall platform metrics

3. **Reward Calculation Logic**:
   - Automatically calculates rewards when rounds end
   - Handles hedged bets (UP + DOWN) correctly
   - Computes gross rewards (total won) and net P&L (profit after subtracting all bets)
   - Win status based on net profitability, not just gross rewards

4. **Participant Tracking**:
   - Maintains a comma-separated list of all participants per round
   - Processes rewards for all participants immediately when round ends
   - No need to wait for user interaction to see rewards

### Frontend (React + TypeScript + Vite)

**Key Components**:

1. **Header.tsx**:
   - MetaMask wallet connection
   - Network status and account display
   - Styled with gradient text and logo

2. **PlayTab.tsx**:
   - Current round display with live countdown and real-time price
   - Next round betting interface (UP/DOWN buttons)
   - Shows AI prediction for the upcoming round
   - Total pool size and bet distribution for next round
   - Round status and time remaining

3. **DashboardTab.tsx** (merged History + Stats):
   - **Your Performance**: Win rate, total rounds, claimable ETH, invested/returned (ended rounds only)
   - **Claimable Rewards**: Prominent section with one-click claim for all winning bets
   - **Recent Bets**: Paginated history with detailed timing info
     - Round number and outcome (Won/Lost)
     - Bet amounts (split by UP/DOWN if hedged)
     - Price movements (start → end)
     - Status for pending rounds (Active/Waiting)
     - Claim buttons for unclaimed wins
   - **Leaderboard**: Top 10 players by total P&L
   - **AI Performance**: AI's win rate and accuracy
   - Clean, compact design with dark/light theme support

4. **AnalyticsTab.tsx** (Envio showcase):
   - **Live Status Bar**: Query performance metrics ("Data fetched in X ms")
   - **Auto-refresh toggle**: Optional 60s refresh with live indicator
   - **Protocol Overview**: Total volume, rounds, active users
   - **Recent Activity Feed**: Last 15 bets across all users
   - **AI Predictions**: Win rate, accuracy stats with pie chart
   - **Round Results**: UP/DOWN distribution with percentages
   - **Bet Distribution**: Total UP vs DOWN volume
   - **Pool Size Trends**: Average pool growth over time
   - **User Participation**: Active players growth chart
   - **ETH Price History**: Historical price movements
   - **Bet Side Trends**: UP vs DOWN betting patterns
   - **Powered by Envio** badge with lightning-fast query performance
   - Publicly accessible without wallet connection

5. **Web3Context.tsx**:
   - Manages Web3 connection state
   - Handles MetaMask account/network changes
   - Provides contract instances throughout app

**GraphQL Integration**:
- Apollo Client for querying indexed data
- Real-time data fetching with network-only policy
- Efficient queries for user history, stats, and leaderboard

**UI/UX Features**:
- 🎨 Modern, sci-fi web3 aesthetic with dark/light theme
- 📱 Fully responsive layout (mobile-friendly)
- ⚡ Real-time updates without page refresh
- 🔄 Optimistic UI with loading states
- ✅ Transaction feedback and confirmations
- 🎯 Compact, information-dense design
- 📊 Interactive charts with Recharts
- 🌈 Gradient effects and smooth animations

## ✨ Key Features & Innovations

### 🎮 For Players
✅ **Fair & Transparent**: All bets and outcomes recorded on-chain  
✅ **Flexible Betting**: Bet any amount, hedge positions, or go all-in on both sides  
✅ **Real-Time Tracking**: Live price updates, countdowns, and pool distribution  
✅ **Instant Visibility**: Rewards calculated immediately when round ends (no waiting!)  
✅ **Competitive**: Compare your performance to others and challenge the AI  
✅ **Secure & Non-Custodial**: You control your funds via MetaMask  
✅ **Public Analytics**: View protocol stats without connecting wallet  
✅ **Smart Dashboard**: See claimable rewards, history, and leaderboard in one view  

### 🔧 For Developers & Judges
✅ **Production-Ready**: Fully deployed on Vercel + Envio with verified contracts  
✅ **Modern Stack**: Solidity, TypeScript, React, Vite, TailwindCSS, Apollo GraphQL  
✅ **Blazing-Fast Indexing**: Envio HyperIndex with sub-100ms query times  
✅ **Triple Oracle Integration**: Chainlink Price Feeds + Functions + Automation  
✅ **Advanced Reward Logic**: Handles hedged bets, calculates net P&L correctly  
✅ **Optimized Gas Usage**: Efficient storage patterns, batched operations  
✅ **Clean Architecture**: Clear separation of concerns across 3 layers  
✅ **Comprehensive Testing**: Foundry test suite for smart contracts  
✅ **Real User Activity**: Live bets from automated players for demo purposes  

## 🏆 Hackathon Highlights

### Why This Project Stands Out:

1. **🚀 Fully Deployed & Live**
   - Not just a prototype - it's a working dApp on testnet
   - Real users can connect and play right now
   - Verified smart contract on Etherscan
   - Production frontend on Vercel
   - Hosted backend indexer on Envio

2. **⚡ Envio Integration Excellence**
   - Advanced analytics dashboard showcasing Envio's speed
   - Query performance metrics displayed in real-time
   - Complex aggregations (leaderboards, trends, participation)
   - Immediate reward calculation on `RoundEnded` event
   - Handles 75+ rounds of historical data efficiently

3. **🔗 Chainlink Triple-Integration**
   - **Price Feeds**: Tamper-proof ETH/USD price data
   - **Functions**: Decentralized AI predictions via external API
   - **Automation**: Autonomous round management every hour

4. **🎯 Technical Sophistication**
   - Hedged bet accounting (UP + DOWN in same round)
   - Split display for multiple bets per round
   - Win/loss based on net P&L, not gross rewards
   - Participant tracking for batch reward processing
   - Frontend-backend data synchronization

5. **💎 Production Polish**
   - Dark/light theme with smooth transitions
   - Responsive design for all screen sizes
   - Error handling and edge case coverage
   - Optimistic UI updates with fallbacks
   - Clean, maintainable codebase  

## User Flow Example

1. **Connect Wallet**: User clicks "Connect MetaMask" button
2. **View Current Round**: See round #35 is active (started 20 minutes ago), current price is $4,050
3. **Place Bet**: User bets 0.1 ETH on "DOWN" for round #36 (contrarian play against AI)
4. **Wait for Round Start**: Round #36 starts automatically via Chainlink Automation, start price recorded at $4,020
5. **Active Round**: User watches the 1 hour countdown as the price moves
6. **Round Ends**: Round #36 ends after 1 hour, final price is $3,980
7. **Result**: DOWN wins! User sees "Won" badge and potential reward of 0.18 ETH in History tab
8. **Claim**: User clicks "Claim" button, receives 0.18 ETH (0.08 ETH profit)
9. **Check Stats**: Stats tab shows updated win rate, total profit, and leaderboard position

## Technical Highlights

### Smart Contract Innovations
- **Efficient Storage**: Uses mappings and structs for optimal gas usage
- **Flexible Fee System**: Protocol fee configurable with basis points precision
- **Double-Bet Support**: Handles users betting both sides in same round
- **Batch Processing**: Can calculate rewards for all participants simultaneously

### Indexer Sophistication
- **Immediate Processing**: Rewards calculated on `RoundEnded` event, not lazily
- **Split Display**: Frontend shows separate entries for UP and DOWN bets in same round
- **Accurate Win/Loss**: Based on net P&L, handles hedge accounting correctly
- **Persistent Tracking**: Uses participant list to ensure no user is missed

### Frontend Polish
- **Smart Dashboard**: Merged history + stats for better UX
- **Analytics Showcase**: Separate tab highlighting Envio's query speed
- **Local State Persistence**: Tracks claimed rewards even before backend confirms
- **Ended Rounds Only Stats**: Accurate P&L calculations excluding pending bets
- **Account Switching**: Properly handles MetaMask account changes mid-session
- **Theme Support**: Beautiful dark/light mode with smooth transitions
- **Pagination**: Handles large bet histories with 10 items per page

## Project Structure

```
PredictronArena/
├── contracts/               # Solidity smart contracts
│   ├── PredictronArena.sol # Main game contract
│   └── mocks/              # Mock contracts for testing
├── backend/                # Envio indexer
│   ├── schema.graphql      # GraphQL schema
│   ├── config.yaml         # Indexer configuration
│   └── src/
│       └── EventHandlers.ts # Event processing logic
├── frontend/               # React frontend
│   └── src/
│       ├── components/     # React components
│       ├── contexts/       # Web3 context
│       ├── graphql/        # GraphQL queries
│       └── contracts/      # Contract ABIs and addresses
├── script/                 # Deployment scripts
└── test/                   # Foundry tests
```

## 🎮 How to Test (For Judges)

### Quick Start (1 minute)
1. Visit [https://predictron-arena.vercel.app/](https://predictron-arena.vercel.app/)
2. Connect MetaMask to Sepolia testnet
3. Get Sepolia ETH from [faucet](https://sepoliafaucet.com/)
4. Navigate to **Play** tab → Place a bet on UP or DOWN
5. Check **Dashboard** tab → See your stats and leaderboard
6. Check **Analytics** tab → View protocol-wide data (no wallet needed!)

### What to Look For
- ⚡ **Speed**: Notice query times in Analytics tab (~50-100ms)
- 📊 **Data Quality**: Accurate reward calculations, proper hedge handling
- 🎨 **UX**: Clean interface, responsive design, dark/light theme
- 🔄 **Real-time**: Pool updates, countdown timers, live price
- 🏆 **Features**: Leaderboard, AI stats, historical trends

---

## 🛠️ Development Setup

### Prerequisites
- Node.js v20
- pnpm package manager
- Foundry (for smart contracts)
- Docker (for backend indexer)
- MetaMask wallet

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/PredictronArena.git
   cd PredictronArena
   ```

2. **Install contract dependencies**
   ```bash
   forge install
   ```

3. **Install backend dependencies**
   ```bash
   cd backend
   pnpm install
   ```

4. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   ```

### Running Locally

1. **Start the backend indexer**
   ```bash
   cd backend
   pnpm dev
   ```

2. **Start the frontend**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Access the app**
   - Open http://localhost:5173 in your browser
   - Connect your MetaMask wallet (Sepolia network)

### Testing Smart Contracts

```bash
forge test
forge test -vvv  # Verbose output
```

### Deploying Contracts

```bash
forge script script/DeployAndConfigureArena.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
```

## 🌐 Deployment Details

### Live URLs
- **Frontend**: [https://predictron-arena.vercel.app/](https://predictron-arena.vercel.app/)
- **Smart Contract**: Verified on [Sepolia Etherscan](https://sepolia.etherscan.io/address/0xe62fcb22480950aa6c9f49dc1057752e1add52c2)
- **GraphQL API**: Envio-hosted endpoint (Hasura)
- **Network**: Ethereum Sepolia Testnet (Chain ID: 11155111)

### Configuration
- **Price Oracle**: Chainlink ETH/USD Price Feed
- **Round Duration**: ~1 hour (3300 seconds)
- **Automation**: Chainlink Automation (hourly triggers)
- **AI Predictions**: Chainlink Functions (CloudFront AI API)
- **Indexer**: Envio HyperIndex + PostgreSQL + Hasura
- **Frontend Hosting**: Vercel (auto-deploy from main branch)
- **Backend Hosting**: Envio Cloud (free tier)

## Future Enhancements

- Multiple asset pairs (BTC/USD, etc.)
- Longer/shorter round durations
- Tournament modes with entry fees and prize pools
- NFT rewards for top performers
- Social features (chat, predictions discussion)
- Mobile app (React Native)
- Mainnet deployment

## Security Considerations

- Smart contracts use OpenZeppelin libraries for security
- ReentrancyGuard protects against reentrancy attacks
- Pausable mechanism for emergency stops
- Chainlink oracles ensure tamper-proof price data
- Non-custodial design - users always control their funds

## 📹 Demo & Resources

- **Live Demo**: [predictron-arena.vercel.app](https://predictron-arena.vercel.app/)
- **Video Walkthrough**: _(Coming soon)_
- **GitHub Repository**: [Link to repo]
- **Contract on Etherscan**: [Verified contract](https://sepolia.etherscan.io/address/0xe62fcb22480950aa6c9f49dc1057752e1add52c2)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🙏 Acknowledgments & Tech Partners

### Core Infrastructure
- 🔨 **Smart Contracts**: Built with [Foundry](https://github.com/foundry-rs/foundry) - blazing fast Solidity framework
- ⚡ **Indexer**: Powered by [Envio HyperIndex](https://envio.dev) - sub-second blockchain data queries
- 🔗 **Oracles**: [Chainlink](https://chain.link) Price Feeds, Functions, and Automation
- ⛓️ **Blockchain**: Ethereum Sepolia testnet

### Frontend & DevTools
- ⚛️ **Framework**: [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org/)
- ⚡ **Build Tool**: [Vite](https://vitejs.dev/) - next-generation frontend tooling
- 🎨 **Styling**: [Tailwind CSS](https://tailwindcss.com) - utility-first CSS framework
- 📊 **Charts**: [Recharts](https://recharts.org/) - composable charting library
- 🔄 **State**: [Apollo Client](https://www.apollographql.com/) - GraphQL data management
- 🦊 **Web3**: [ethers.js](https://docs.ethers.org/) - Ethereum library
- 🚀 **Hosting**: [Vercel](https://vercel.com/) - frontend deployment

### Special Thanks
- ETHGlobal for organizing this amazing hackathon
- Envio team for their excellent indexer documentation and support
- Chainlink for comprehensive oracle solutions
- The Ethereum and Web3 community

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

# 🎯 Predictron Arena

**Where predictions meet profits on the blockchain!**

[🚀 Live Demo](https://predictron-arena.vercel.app/) • [📜 Contract](https://sepolia.etherscan.io/address/0xe62fcb22480950aa6c9f49dc1057752e1add52c2) • [⚡ Powered by Envio](https://envio.dev)

Built with ❤️ for ETHGlobal Hackathon 2025

</div>

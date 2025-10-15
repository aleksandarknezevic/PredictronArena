// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {
    AutomationCompatibleInterface
} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

enum Side {
    None,
    Up,
    Down
}

contract PredictronArena is
    ReentrancyGuard,
    AccessControl,
    Pausable,
    FunctionsClient,
    AutomationCompatibleInterface,
    ConfirmedOwner
{
    error PredictronArena__MinBetNotMet();
    error PredictronArena__InvalidSide();
    error PredictronArena__RoundAlreadyStarted();
    error PredictronArena__PreviousRoundNotEnded();
    error PredictronArena__RoundWithoutBets();
    error PredictronArena__RoundNotStarted();
    error PredictronArena__RoundCannotBeEnded();
    error PredictronArena__RoundAlreadyEnded();
    error PredictronArena__RoundNotEnded();
    error PredictronArena__NoReward();
    error PredictronArena__AlreadyClaimed();
    error PredictronArena__TransferFailed();
    error PredictronArena__WrongAddress();
    error PredictronArena__FunctionsNotSetBadConfig();
    error PredictronArena__FunctionsNotSetHighGas();
    error PredictronArena__GrantRoleFailed();

    struct Bet {
        uint256 amount;
        Side side;
        address player;
    }

    struct UserBet {
        uint256 upAmount;
        uint256 downAmount;
    }

    struct Round {
        uint256 id;
        uint256 startTs;
        uint256 endTs;
        int256 startPrice;
        int256 endPrice;
        uint256 totalUp;
        uint256 totalDown;
        Side winningSide;
    }

    uint256 public constant MIN_BET = 5 * 10 ** 15;
    uint256 public constant PRECISION = 10 ** 8;
    uint256 public constant PROTOCOL_FEE = 200;
    uint256 public constant PROTOCOL_FEE_PRECISION = 1e4;
    uint256 public constant ROUND_INTERVAL = 3300; // 1 hour - 5 minutes due to potential Automations/Functions delays
    uint256 public currentRoundId;
    uint256 public nextRoundId;
    bytes32 public constant ROUND_MANAGER_ROLE = keccak256("ROUND_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");
    uint256 public protocolFeesCollected;
    bytes32 public immutable DON_ID;
    uint64 public subscriptionId;
    bytes public jsSource;
    bytes public encryptedSecretsReference;
    uint32 public callbackGasLimit = 3e5;
    uint256 public lastRun;
    AggregatorV3Interface public immutable PRICE_FEED;
    mapping(uint256 => Bet[]) public betsByRound;
    mapping(uint256 => mapping(address => UserBet)) public userBetsByRound;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event BetPlaced(uint256 indexed roundId, address indexed user, uint256 amount, Side side);
    event RoundStarted(uint256 indexed roundId, uint256 startTs, int256 startPrice);
    event RoundEnded(uint256 indexed roundId, uint256 endTs, int256 endPrice, Side result);
    event RewardClaimed(uint256 indexed roundId, address indexed user, uint256 amount);
    event ProtocolFeesClaimed(address indexed to, uint256 amount);
    event FunctionsSet(bytes jsSource, bytes encryptedSecretsReference, uint64 subscriptionId, uint32 callbackGasLimit);
    event ExternalPredictionAdded(uint256 indexed roundId, Side aiPrediction);
    event FunctionsRequested(bytes32 requestId, uint256 roundId);
    event EndRoundOk(uint256 roundId);
    event EndRoundFailed(bytes reason);
    event StartRoundOk(uint256 roundId, Side side);
    event StartRoundFailed(Side side, bytes reason);
    event UpkeepSkipped(uint8 reason);

    constructor(address deployer, address _priceFeed, address _functionsRouter, bytes32 _donId)
        FunctionsClient(_functionsRouter)
        ConfirmedOwner(msg.sender)
    {
        bool success_admin_owner = _grantRole(DEFAULT_ADMIN_ROLE, deployer);
        bool success_round_manager_owner = _grantRole(ROUND_MANAGER_ROLE, deployer);
        bool success_pauser_owner = _grantRole(PAUSER_ROLE, deployer);
        bool success_round_manager_contract = _grantRole(ROUND_MANAGER_ROLE, address(this));
        if (
            !success_admin_owner || !success_round_manager_owner || !success_pauser_owner
                || !success_round_manager_contract
        ) {
            revert PredictronArena__GrantRoleFailed();
        }
        PRICE_FEED = AggregatorV3Interface(_priceFeed);
        currentRoundId = 0;
        nextRoundId = 1;
        DON_ID = _donId;
    }

    function setFunctions(bytes calldata src, bytes calldata encRef, uint64 subId, uint32 cbGas) external onlyOwner {
        if (src.length == 0 || encRef.length == 0 || subId == 0) {
            revert PredictronArena__FunctionsNotSetBadConfig();
        }
        if (cbGas > 3e5) {
            revert PredictronArena__FunctionsNotSetHighGas();
        }
        jsSource = src;
        encryptedSecretsReference = encRef;
        subscriptionId = subId;
        callbackGasLimit = cbGas;
        emit FunctionsSet(src, encRef, subId, cbGas);
    }

    function setAutomation(address forwarder) external onlyOwner {
        if (forwarder == address(0)) {
            revert PredictronArena__WrongAddress();
        }
        bool success = _grantRole(AUTOMATION_ROLE, forwarder);
        if (!success) {
            revert PredictronArena__GrantRoleFailed();
        }
    }

    function checkUpkeep(bytes calldata) external view override returns (bool, bytes memory) {
        bool functionsSet = subscriptionId != 0 && jsSource.length > 0 && encryptedSecretsReference.length > 0;
        bool timeElapsed = (block.timestamp - lastRun) >= ROUND_INTERVAL;
        bool ready = !paused() && functionsSet && timeElapsed;
        return (ready, "");
    }

    function performUpkeep(bytes calldata) external override onlyRole(AUTOMATION_ROLE) whenNotPaused {
        if ((block.timestamp - lastRun) < ROUND_INTERVAL) {
            emit UpkeepSkipped(1);
            return;
        }
        bool functionsSet = subscriptionId != 0 && jsSource.length > 0 && encryptedSecretsReference.length > 0;
        if (!functionsSet) {
            emit UpkeepSkipped(2);
            return;
        }
        lastRun = block.timestamp;
        bytes32 requestId = _request();
        if (requestId == bytes32(0)) {
            emit UpkeepSkipped(3);
            return;
        }
    }

    function _request() internal returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        FunctionsRequest.initializeRequestForInlineJavaScript(req, string(jsSource));
        req.secretsLocation = FunctionsRequest.Location.Remote;
        req.encryptedSecretsReference = encryptedSecretsReference;

        bytes memory encoded = FunctionsRequest.encodeCBOR(req);
        requestId = _sendRequest(encoded, subscriptionId, callbackGasLimit, DON_ID);

        emit FunctionsRequested(requestId, nextRoundId);
        return requestId;
    }

    function fulfillRequest(bytes32, bytes memory response, bytes memory) internal override {
        uint256 code = response.length >= 32 ? abi.decode(response, (uint256)) : 0;
        Side side = (code == 1) ? Side.Up : Side.Down;

        if (paused()) return;

        uint256 curId = currentRoundId;
        Round storage cur = rounds[curId];

        if (cur.startTs > 0 && cur.endTs == 0 && block.timestamp >= cur.startTs + ROUND_INTERVAL) {
            try this.endRound() {
                emit EndRoundOk(curId);
            } catch (bytes memory reason) {
                emit EndRoundFailed(reason);
                return;
            }
        }

        try this.startRound(side) {
            uint256 newId = currentRoundId;
            emit StartRoundOk(newId, side);
        } catch (bytes memory reason) {
            emit StartRoundFailed(side, reason);
        }
    }

    function placeBet(Side side) external payable nonReentrant whenNotPaused {
        uint256 roundId = nextRoundId;
        Round storage r = rounds[roundId];
        if (msg.value < MIN_BET) {
            revert PredictronArena__MinBetNotMet();
        }

        if (side != Side.Up && side != Side.Down) {
            revert PredictronArena__InvalidSide();
        }

        if (r.startTs > 0) {
            revert PredictronArena__RoundAlreadyStarted();
        }

        betsByRound[roundId].push(Bet({player: msg.sender, amount: msg.value, side: side}));

        if (side == Side.Up) {
            userBetsByRound[roundId][msg.sender].upAmount += msg.value;
            r.totalUp += msg.value;
        } else {
            userBetsByRound[roundId][msg.sender].downAmount += msg.value;
            r.totalDown += msg.value;
        }

        emit BetPlaced(roundId, msg.sender, msg.value, side);
    }

    function startRound(Side aiPrediction) external onlyRole(ROUND_MANAGER_ROLE) whenNotPaused {
        if (currentRoundId > 0) {
            Round storage prevRound = rounds[currentRoundId];
            if (prevRound.endTs == 0) {
                revert PredictronArena__PreviousRoundNotEnded();
            }
        }

        Round storage r = rounds[nextRoundId];

        if (r.totalDown + r.totalUp == 0) {
            revert PredictronArena__RoundWithoutBets();
        }

        r.id = nextRoundId;
        r.startPrice = getLatestPrice();
        r.startTs = block.timestamp;

        currentRoundId = nextRoundId;
        nextRoundId += 1;

        emit RoundStarted(currentRoundId, r.startTs, r.startPrice);
        emit ExternalPredictionAdded(currentRoundId, aiPrediction);
    }

    function endRound() external onlyRole(ROUND_MANAGER_ROLE) {
        Round storage r = rounds[currentRoundId];
        if (r.startTs == 0) {
            revert PredictronArena__RoundNotStarted();
        }

        if (block.timestamp < r.startTs + ROUND_INTERVAL) {
            revert PredictronArena__RoundCannotBeEnded();
        }

        if (r.endTs != 0) {
            revert PredictronArena__RoundAlreadyEnded();
        }

        r.endPrice = getLatestPrice();
        r.endTs = block.timestamp;

        Side side = Side.None;
        if (r.endPrice > r.startPrice) {
            side = Side.Up;
        } else if (r.endPrice < r.startPrice) {
            side = Side.Down;
        } else {
            side = Side.None;
        }
        r.winningSide = side;

        uint256 fee = calculateFee(r.id);
        protocolFeesCollected += fee;

        emit RoundEnded(currentRoundId, r.endTs, r.endPrice, side);
    }

    function claim(uint256 roundId) external nonReentrant whenNotPaused {
        Round storage round = rounds[roundId];
        if (round.endTs == 0) {
            revert PredictronArena__RoundNotEnded();
        }

        if (hasClaimed[roundId][msg.sender]) {
            revert PredictronArena__AlreadyClaimed();
        }

        uint256 payout = calculateReward(roundId, msg.sender);

        if (payout == 0) {
            revert PredictronArena__NoReward();
        }

        hasClaimed[roundId][msg.sender] = true;

        if (msg.sender == address(0)) {
            revert PredictronArena__WrongAddress();
        }

        (bool sent,) = msg.sender.call{value: payout}("");
        if (!sent) {
            revert PredictronArena__TransferFailed();
        }
        emit RewardClaimed(roundId, msg.sender, payout);
    }

    function claimProtocolFees() external nonReentrant onlyOwner whenNotPaused {
        uint256 amount = protocolFeesCollected;
        if (amount == 0) {
            revert PredictronArena__NoReward();
        }
        protocolFeesCollected = 0;

        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) {
            revert PredictronArena__TransferFailed();
        }
        emit ProtocolFeesClaimed(msg.sender, amount);
    }

    function calculateReward(uint256 roundId, address user) public view returns (uint256) {
        UserBet memory bet = userBetsByRound[roundId][user];
        Side winningSide = rounds[roundId].winningSide;
        uint256 totalWinning;
        uint256 totalLosing;
        uint256 userShare;

        uint256 rewards = 0;
        if (winningSide == Side.Up && bet.upAmount > 0) {
            totalWinning = rounds[roundId].totalUp;
            totalLosing = rounds[roundId].totalDown;
            userShare = (bet.upAmount * PRECISION) / totalWinning;
        } else if (winningSide == Side.Down && bet.downAmount > 0) {
            totalWinning = rounds[roundId].totalDown;
            totalLosing = rounds[roundId].totalUp;
            userShare = (bet.downAmount * PRECISION) / totalWinning;
        } else if (winningSide == Side.None) {
            return 0;
        }
        uint256 fee = (totalLosing * PROTOCOL_FEE) / PROTOCOL_FEE_PRECISION;
        uint256 rewardPool = totalLosing - fee;
        uint256 totalPayout = totalWinning + rewardPool;
        rewards = (userShare * totalPayout) / PRECISION;
        return rewards;
    }

    function calculateFee(uint256 roundId) public view returns (uint256) {
        Round memory r = rounds[roundId];
        Side side = r.winningSide;
        uint256 fee;
        if (side == Side.None) {
            fee = r.totalDown + r.totalUp;
        } else {
            uint256 totalLosing = side == Side.Up ? r.totalDown : r.totalUp;
            uint256 totalWinning = side == Side.Up ? r.totalUp : r.totalDown;
            if (totalWinning == 0) {
                fee = totalLosing;
            } else {
                fee = (totalLosing * PROTOCOL_FEE) / PROTOCOL_FEE_PRECISION;
            }
        }
        return fee;
    }

    receive() external payable {}

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function getRound(uint256 _roundId) external view returns (Round memory) {
        return rounds[_roundId];
    }

    function getCurrentRound() external view returns (Round memory) {
        return rounds[currentRoundId];
    }

    function getLatestPrice() public view returns (int256) {
        (, int256 price,,,) = PRICE_FEED.latestRoundData();
        return price;
    }
}

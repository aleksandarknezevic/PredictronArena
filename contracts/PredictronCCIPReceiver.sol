// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CCIPReceiver} from "@chainlink/contracts/src/v0.8/ccip/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts/src/v0.8/ccip/libraries/Client.sol";

interface IPredictronArena {
    enum Side {
        None,
        Up,
        Down
    }
    function startRound(Side aiPrediction) external;
    function endRound() external;
    function getCurrentRound()
        external
        view
        returns (
            uint256 id,
            uint256 startTs,
            uint256 endTs,
            int256 startPrice,
            int256 endPrice,
            uint256 totalUp,
            uint256 totalDown,
            Side winningSide
        );
}

contract PredictronCCIPReceiver is CCIPReceiver {
    address public immutable TRUSTED_SENDER;
    uint64 public immutable SOURCE_CHAIN_SELECTOR;
    IPredictronArena public immutable ARENA;

    event PredictionReceived(uint256 roundId, uint8 direction, uint64 ts);
    event EndRoundOk(uint256 roundId);
    event EndRoundFailed(bytes reason);
    event StartRoundOk(uint256 newRoundId, IPredictronArena.Side side);
    event StartRoundFailed(IPredictronArena.Side side, bytes reason);

    error PredictronCCIPReceiver__NotTrustedSender();
    error PredictronCCIPReceiver__WrongChain();

    constructor(address _ccipRouter, address _arena, address _trustedSender, uint64 _sourceChainSelector)
        CCIPReceiver(_ccipRouter)
    {
        ARENA = IPredictronArena(_arena);
        TRUSTED_SENDER = _trustedSender;
        SOURCE_CHAIN_SELECTOR = _sourceChainSelector;
    }

    function _ccipReceive(Client.Any2EVMMessage memory msg_) internal override {
        if (abi.decode(msg_.sender, (address)) != TRUSTED_SENDER) {
            revert PredictronCCIPReceiver__NotTrustedSender();
        }
        if (msg_.sourceChainSelector != SOURCE_CHAIN_SELECTOR) {
            revert PredictronCCIPReceiver__WrongChain();
        }

        (uint256 roundId, uint8 dir, uint64 ts) = abi.decode(msg_.data, (uint256, uint8, uint64));
        emit PredictionReceived(roundId, dir, ts);

        IPredictronArena.Side side = (dir == 1) ? IPredictronArena.Side.Up : IPredictronArena.Side.Down;

        (uint256 curId, uint256 startTs, uint256 endTs,,,,,) = ARENA.getCurrentRound();

        if (startTs > 0 && endTs == 0) {
            try ARENA.endRound() {
                emit EndRoundOk(curId);
            } catch (bytes memory reason) {
                emit EndRoundFailed(reason);
                return;
            }
        }

        try ARENA.startRound(side) {
            (uint256 newId,,,,,,,) = ARENA.getCurrentRound();
            emit StartRoundOk(newId, side);
        } catch (bytes memory reason) {
            emit StartRoundFailed(side, reason);
        }
    }
}

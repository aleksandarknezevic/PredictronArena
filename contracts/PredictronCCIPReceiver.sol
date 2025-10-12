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
}

contract PredictronCCIPReceiver is CCIPReceiver {
    address public immutable TRUSTED_SENDER;
    uint64 public immutable SOURCE_CHAIN_SELECTOR;
    IPredictronArena public immutable ARENA;
    bytes4 constant ROUND_CANNOT_BE_ENDED_SELECTOR = bytes4(keccak256("PredictronArena__RoundCannotBeEnded()"));

    event PredictionReceived(uint256 roundId, uint8 direction, uint64 ts);

    error PredictronCCIPReceiver__NotTrustedSender();
    error PredictronCCIPReceiver__WrongChain();
    error PredictronCCIPReceiver__RoundCannotBeEnded();

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
        bool ended;

        try ARENA.endRound() {
            ended = true;
        } catch (bytes memory reason) {
            ended = false;

            if (reason.length >= 4) {
                bytes4 sel;
                assembly {
                    sel := mload(add(reason, 0x20))
                }
                if (sel == ROUND_CANNOT_BE_ENDED_SELECTOR) {
                    revert PredictronCCIPReceiver__RoundCannotBeEnded();
                }
            }
        }
        ARENA.startRound(side);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HederaHelperConfig} from "./HederaHelperConfig.s.sol";
import {PredictronArena} from "../contracts/PredictronArena.sol";
import {PredictronCCIPReceiver} from "../contracts/PredictronCCIPReceiver.sol";

contract DeployArenaAndReceiver is Script {
    /// Env vars (set before running):
    /// - OPTIONAL ARENA_ADDR              : address — if set, we won't deploy Arena; we'll attach to it
    /// - HEDERA_CCIP_ROUTER                      : address — CCIP router on THIS chain
    /// - RECEIVER_TRUSTED_SENDER          : address — sender contract on the source chain
    /// - RECEIVER_SOURCE_SELECTOR         : uint64  — chain selector of the source chain
    function run() external returns (PredictronArena arena, PredictronCCIPReceiver receiver, HederaHelperConfig cfg) {
        cfg = new HederaHelperConfig();
        address priceFeed = cfg.getConfigByChainId(block.chainid).priceFeed;

        address maybeArena = vm.envOr("ARENA_ADDR", address(0));
        address ccipRouter = vm.envAddress("HEDERA_CCIP_ROUTER");
        address trustedSender = vm.envAddress("RECEIVER_TRUSTED_SENDER");
        uint64 sourceSelector = uint64(vm.envUint("RECEIVER_SOURCE_SELECTOR"));

        vm.startBroadcast();

        if (maybeArena == address(0)) {
            arena = new PredictronArena(msg.sender, priceFeed);
        } else {
            arena = PredictronArena(maybeArena);
        }

        receiver = new PredictronCCIPReceiver(ccipRouter, address(arena), trustedSender, sourceSelector);

        bytes32 role = arena.ROUND_MANAGER_ROLE();
        arena.grantRole(role, address(receiver));

        vm.stopBroadcast();

        console2.log("Arena:               ", address(arena));
        console2.log("Receiver:            ", address(receiver));
        console2.log("CCIP Router:         ", ccipRouter);
        console2.log("Trusted Sender:      ", trustedSender);
        console2.log("Source ChainSelector:", sourceSelector);
        console2.logBytes32(role);
    }
}

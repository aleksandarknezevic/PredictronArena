// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HelperConfig} from "./HelperConfig.s.sol";
import {PredictronArena} from "../contracts/PredictronArena.sol";

contract DeployAndConfigureArena is Script {
    address constant DEFAULT_FUNCTIONS_ROUTER = 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0;
    string constant DEFAULT_DON_ID_STR = "fun-ethereum-sepolia-1";
    string constant DEFAULT_SOURCE_PATH = "./chainlink-functions/source.js";
    uint32 constant DEFAULT_CALLBACK_GAS = 3e5;

    error DeployAndConfigureArena__BadCallbackGas();
    /// Env vars (set before running):
    //   OPTIONAL ARENA_ADDR              : address — if set, we won't deploy Arena; we'll attach to it
    //   FUNCTIONS_ROUTER (optional; defaults to DEFAULT_FUNCTIONS_ROUTER)
    //   DON_ID_STR       (optional; defaults to DEFAULT_DON_ID_STR)
    //   SUB_ID           (uint64)
    //   ENC_REF_HEX      (bytes hex, e.g. 0x....)
    //   SOURCE_PATH      (optional; defaults to DEFAULT_SOURCE_PATH)
    //   CALLBACK_GAS     (optional uint32; defaults to DEFAULT_CALLBACK_GAS)

    function run() external returns (PredictronArena arena, HelperConfig cfg) {
        address functionsRouter = vm.envOr("FUNCTIONS_ROUTER", DEFAULT_FUNCTIONS_ROUTER);
        string memory donStr = vm.envOr("DON_ID_STR", DEFAULT_DON_ID_STR);
        uint64 subId = uint64(vm.envUint("SUB_ID")); // must be set
        bytes memory encRef = vm.envBytes("ENC_REF_HEX"); // must be set (0x...)
        string memory srcPath = vm.envOr("SOURCE_PATH", DEFAULT_SOURCE_PATH);
        uint32 cbGas = uint32(vm.envOr("CALLBACK_GAS", uint256(DEFAULT_CALLBACK_GAS)));
        address automationsAddress = address(vm.envOr("AUTOMATIONS_ADDR", address(0)));
        bool useAutomations = automationsAddress != address(0);

        if (cbGas > 3e5) {
            revert DeployAndConfigureArena__BadCallbackGas();
        }

        bytes32 donId = bytes32(bytes(donStr));

        cfg = new HelperConfig();
        address priceFeed = cfg.getConfigByChainId(block.chainid).priceFeed;

        address maybeArena = vm.envOr("ARENA_ADDR", address(0));

        vm.startBroadcast();

        if (maybeArena == address(0)) {
            arena = new PredictronArena(msg.sender, priceFeed, functionsRouter, donId);
        } else {
            arena = PredictronArena(payable(maybeArena));
        }

        string memory js = vm.readFile(srcPath);
        arena.setFunctions(bytes(js), encRef, subId, cbGas);

        if (useAutomations) {
            arena.setAutomations(automationsAddress);
        }

        vm.stopBroadcast();

        console2.log("Configured SUB_ID:", subId);
        console2.log("jsSource bytes len:", bytes(js).length);
        console2.log("encRef bytes len:", encRef.length);
        console2.log("Arena:               ", address(arena));
        console2.log("Price Feed:         ", address(priceFeed));
        console2.log("Functions Router:   ", functionsRouter);
        console2.log("DON ID:             ", donStr);
        console2.log("Callback Gas Limit: ", cbGas);
        if (useAutomations) {
            console2.log("Automations:        ", automationsAddress);
        } else {
            console2.log("Automations:        none");
        }
    }
}

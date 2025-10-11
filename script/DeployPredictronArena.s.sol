// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {HelperConfig} from "./HelperConfig.s.sol";
import {PredictronArena} from "../contracts/PredictronArena.sol";

contract DeployPredictronArena is Script {
    function deployPredictronArena() public returns (PredictronArena, HelperConfig) {
        // Load or deploy mocks from HelperConfig
        HelperConfig helperConfig = new HelperConfig();
        address priceFeed = helperConfig.getConfigByChainId(block.chainid).priceFeed;

        vm.startBroadcast();
        PredictronArena predictronArena = new PredictronArena(msg.sender, priceFeed);
        vm.stopBroadcast();

        return (predictronArena, helperConfig);
    }

    function run() external returns (PredictronArena, HelperConfig) {
        return deployPredictronArena();
    }
}

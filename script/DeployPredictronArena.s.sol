// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {HederaHelperConfig} from "./HederaHelperConfig.s.sol";
import {PredictronArena} from "../contracts/PredictronArena.sol";

contract DeployPredictronArena is Script {
    function deployPredictronArena() public returns (PredictronArena, HederaHelperConfig) {
        HederaHelperConfig hederaHelperConfig = new HederaHelperConfig();
        address priceFeed = hederaHelperConfig.getConfigByChainId(block.chainid).priceFeed;

        vm.startBroadcast();
        PredictronArena predictronArena = new PredictronArena(msg.sender, priceFeed);
        vm.stopBroadcast();

        return (predictronArena, hederaHelperConfig);
    }

    function run() external returns (PredictronArena, HederaHelperConfig) {
        return deployPredictronArena();
    }
}

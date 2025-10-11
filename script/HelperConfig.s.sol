// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockV3Aggregator} from "../test/mock/MockV3Aggregator.sol";
import {Script, console2} from "forge-std/Script.sol";

abstract contract CodeConstants {
    uint8 public constant DECIMALS = 8;
    int256 public constant INITIAL_PRICE = 3e7;
    uint256 public constant HEDERA_TESTNET_CHAIN_ID = 296;
    uint256 public constant LOCAL_CHAIN_ID = 31337;
}

contract HelperConfig is CodeConstants, Script {
    error HelperConfig__InvalidChainId();

    struct NetworkConfig {
        address priceFeed;
    }

    NetworkConfig public localNetworkConfig;
    mapping(uint256 => NetworkConfig) public networkConfigs;

    constructor() {
        networkConfigs[HEDERA_TESTNET_CHAIN_ID] = getHederaTestnetConfig();
    }

    function getConfigByChainId(uint256 chainId) public returns (NetworkConfig memory) {
        if (networkConfigs[chainId].priceFeed != address(0)) {
            return networkConfigs[chainId];
        } else if (chainId == LOCAL_CHAIN_ID) {
            return getOrCreateLocalConfig();
        } else {
            revert HelperConfig__InvalidChainId();
        }
    }

    function getHederaTestnetConfig() public pure returns (NetworkConfig memory) {
        return NetworkConfig({priceFeed: address(0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a)});
    }

    function getOrCreateLocalConfig() public returns (NetworkConfig memory) {
        if (localNetworkConfig.priceFeed != address(0)) {
            return localNetworkConfig;
        }

        console2.log(unicode"⚠️ Deploying mock price feed on local chain...");
        vm.startBroadcast();
        MockV3Aggregator mockPriceFeed = new MockV3Aggregator(DECIMALS, INITIAL_PRICE);
        vm.stopBroadcast();

        console2.log(unicode"✅ Mock price feed deployed at:", address(mockPriceFeed));

        localNetworkConfig = NetworkConfig({priceFeed: address(mockPriceFeed)});
        return localNetworkConfig;
    }
}

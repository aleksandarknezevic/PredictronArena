// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PredictronCCIPSender} from "../contracts/PredictronCCIPSender.sol";

contract DeployAndConfigurePredictronCCIPSender is Script {
    address constant DEFAULT_FUNCTIONS_ROUTER = 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0;
    string constant DEFAULT_DON_ID_STR = "fun-ethereum-sepolia-1";

    address constant DEFAULT_CCIP_ROUTER = 0x0000000000000000000000000000000000000000;

    string constant DEFAULT_SOURCE_PATH = "./chainlink-functions/source.js";

    uint32 constant DEFAULT_CALLBACK_GAS = 300_000;

    // ========= Env keys =========
    // Required:
    //   FUNCTIONS_ROUTER (optional; defaults to DEFAULT_FUNCTIONS_ROUTER)
    //   DON_ID_STR       (optional; defaults to DEFAULT_DON_ID_STR)
    //   SEPOLIA_CCIP_ROUTER      (required)
    //   SUB_ID           (uint64)
    //   ENC_REF_HEX      (bytes hex, e.g. 0x....)
    //   DEST_SELECTOR    (uint64, CCIP destination selector)
    //   DEST_RECEIVER    (address on destination chain)
    //   FEE_TOKEN        (address; 0x0 for native)
    //   SOURCE_PATH      (optional; defaults to DEFAULT_SOURCE_PATH)
    //   CALLBACK_GAS     (optional uint32; defaults to DEFAULT_CALLBACK_GAS)
    //   SENDER_ADDR      (optional; reuse an existing PredictronCCIPSender)

    function run() external {
        address functionsRouter = vm.envOr("FUNCTIONS_ROUTER", DEFAULT_FUNCTIONS_ROUTER);
        string memory donStr = vm.envOr("DON_ID_STR", DEFAULT_DON_ID_STR);
        address ccipRouter = vm.envAddress("SEPOLIA_CCIP_ROUTER"); // must be set
        uint64 subId = uint64(vm.envUint("SUB_ID")); // must be set
        bytes memory encRef = vm.envBytes("ENC_REF_HEX"); // must be set (0x...)
        string memory srcPath = vm.envOr("SOURCE_PATH", DEFAULT_SOURCE_PATH);
        uint32 cbGas = uint32(vm.envOr("CALLBACK_GAS", uint256(DEFAULT_CALLBACK_GAS)));
        uint64 destSelector = uint64(vm.envUint("DEST_SELECTOR")); // must be set
        address destReceiver = vm.envAddress("DEST_RECEIVER"); // must be set
        address feeToken = vm.envAddress("FEE_TOKEN"); // 0x0 for native, or LINK addr
        address maybeSender = vm.envOr("SENDER_ADDR", address(0)); // optional reuse

        require(cbGas <= 300_000, "CALLBACK_GAS > 300k");
        bytes32 donId = bytes32(bytes(donStr));

        vm.startBroadcast();

        PredictronCCIPSender sender;

        if (maybeSender == address(0)) {
            sender = new PredictronCCIPSender(functionsRouter, donId, ccipRouter);
            console2.log("Deployed PredictronCCIPSender:", address(sender));
        } else {
            sender = PredictronCCIPSender(payable(maybeSender));
            console2.log("Using existing PredictronCCIPSender:", address(sender));
        }

        string memory js = vm.readFile(srcPath);
        sender.setFunctions(bytes(js), encRef, subId, cbGas);

        sender.setCCIP(destSelector, destReceiver, feeToken);

        console2.log("Configured SUB_ID:", subId);
        console2.log("jsSource bytes len:", bytes(js).length);
        console2.log("encRef bytes len:", encRef.length);
        console2.log("destSelector:", destSelector);
        console2.log("destReceiver:", destReceiver);
        console2.log("feeToken:", feeToken);

        vm.stopBroadcast();
    }
}

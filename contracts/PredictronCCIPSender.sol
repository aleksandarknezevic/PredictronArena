// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {
    AutomationCompatibleInterface
} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";
import {IRouterClient} from "@chainlink/contracts/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts/src/v0.8/ccip/libraries/Client.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

contract PredictronCCIPSender is FunctionsClient, AutomationCompatibleInterface, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    bytes32 public immutable DON_ID;
    uint64 public subscriptionId;
    bytes public jsSource;
    bytes public encryptedSecretsReference;
    uint32 public callbackGasLimit = 3e5;
    uint32 public constant CCIP_GAS_LIMIT = 3e6;

    // CCIP
    IRouterClient public immutable CCIP_ROUTER;
    uint64 public destChainSelector;
    bytes public destReceiver;
    address public feeToken; // address(0) for native, or LINK token address

    // schedule
    uint256 public constant INTERVAL = 3600; // 1 hour
    uint256 public lastRun;
    uint256 public nextRoundId;

    // last result
    uint8 public lastDirection;
    uint256 public lastAt;

    event FunctionsRequested(bytes32 requestId, uint256 roundId);
    event SentToArena(uint256 roundId, uint8 direction, uint64 ts, bytes32 messageId);
    event NativeWithdrawn(address indexed to, uint256 amount);

    error PredictronCCIPSender__InsufficientBalance();
    error PredictronCCIPSender__WrongAddress();
    error PredictronCCIPSender__TransferFailed();

    constructor(address _functionsRouter, bytes32 _donId, address _ccipRouter)
        FunctionsClient(_functionsRouter)
        ConfirmedOwner(msg.sender)
    {
        DON_ID = _donId;
        CCIP_ROUTER = IRouterClient(_ccipRouter);
        nextRoundId = 1;
    }

    function setFunctions(bytes calldata src, bytes calldata encRef, uint64 subId, uint32 cbGas) external onlyOwner {
        require(src.length > 0 && encRef.length > 0 && subId != 0, "bad cfg");
        require(cbGas <= 300_000, "gas>cap");
        jsSource = src;
        encryptedSecretsReference = encRef;
        subscriptionId = subId;
        callbackGasLimit = cbGas;
    }

    function setCCIP(uint64 selector, address receiver, address _feeToken) external onlyOwner {
        destChainSelector = selector;
        destReceiver = abi.encode(receiver);
        feeToken = _feeToken; // address(0) = native
    }

    function setCCIPReceiver(address receiver) external onlyOwner {
        destReceiver = abi.encode(receiver);
    }

    function checkUpkeep(bytes calldata) external view override returns (bool, bytes memory) {
        bool ready =
            (block.timestamp - lastRun) >= INTERVAL && subscriptionId != 0 && jsSource.length > 0
            && encryptedSecretsReference.length > 0;
        return (ready, "");
    }

    function performUpkeep(bytes calldata) external override {
        if ((block.timestamp - lastRun) < INTERVAL) return;
        lastRun = block.timestamp;
        _request();
    }

    function _request() internal returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(string(jsSource));
        req.secretsLocation = FunctionsRequest.Location.Remote;
        req.encryptedSecretsReference = encryptedSecretsReference;

        requestId = _sendRequest(req.encodeCBOR(), subscriptionId, callbackGasLimit, DON_ID);
        emit FunctionsRequested(requestId, nextRoundId);
    }

    function fulfillRequest(bytes32, bytes memory response, bytes memory) internal override {
        uint256 code = abi.decode(response, (uint256));
        uint8 dir = code == 1 ? 1 : 2;

        lastDirection = dir;
        lastAt = block.timestamp;

        uint64 ts = uint64(block.timestamp);
        bytes memory data = abi.encode(nextRoundId, dir, ts);

        Client.EVM2AnyMessage memory m = Client.EVM2AnyMessage({
            receiver: destReceiver,
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0), // no tokens
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: CCIP_GAS_LIMIT})), // gas for receiver execution on Chain A
            feeToken: feeToken
        });

        uint256 fee = CCIP_ROUTER.getFee(destChainSelector, m);
        bytes32 msgId;
        if (feeToken == address(0)) {
            msgId = CCIP_ROUTER.ccipSend{value: fee}(destChainSelector, m);
        } else {
            msgId = CCIP_ROUTER.ccipSend(destChainSelector, m);
        }

        emit SentToArena(nextRoundId, dir, ts, msgId);
        unchecked {
            nextRoundId++;
        }
    }

    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) {
            revert PredictronCCIPSender__WrongAddress();
        }
        uint256 bal = address(this).balance;
        uint256 amt = amount == 0 ? bal : amount;
        if (amt > bal) {
            revert PredictronCCIPSender__InsufficientBalance();
        }
        (bool ok,) = to.call{value: amt}("");
        if (!ok) {
            revert PredictronCCIPSender__TransferFailed();
        }
        emit NativeWithdrawn(to, amt);
    }

    receive() external payable {}
}

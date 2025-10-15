// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PredictronArena, Side} from "../contracts/PredictronArena.sol";
import {HelperConfig} from "../script/HelperConfig.s.sol";
import {MockV3Aggregator} from "../contracts/mocks/MockV3Aggregator.sol";
import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract PredictronArenaTest is Test {
    PredictronArena public predictronArena;
    HelperConfig public helperConfig;
    MockV3Aggregator public mockFeed;
    address[6] public players;

    function setUp() public {
        helperConfig = new HelperConfig();
        uint256 chainId = block.chainid;
        HelperConfig.NetworkConfig memory networkConfig = helperConfig.getConfigByChainId(chainId);
        predictronArena = new PredictronArena(
            address(this),
            networkConfig.priceFeed,
            0x0000000000000000000000000000000000000000,
            bytes32("fun-ethereum-sepolia-1")
        );
        mockFeed = MockV3Aggregator(address(predictronArena.PRICE_FEED()));
        for (uint256 i = 0; i < 6; i++) {
            players[i] = vm.addr(i + 1);
            vm.deal(players[i], 1000e15);
        }
    }

    function testPlaceBetMinBetNotMet() public {
        vm.expectRevert(PredictronArena.PredictronArena__MinBetNotMet.selector);
        predictronArena.placeBet{value: 5e14}(Side.Up);
    }

    function testPlaceBetInvalidSide() public {
        vm.expectRevert(PredictronArena.PredictronArena__InvalidSide.selector);
        predictronArena.placeBet{value: 5e15}(Side.None);
    }

    function testPlaceBetBetUpDown() public {
        vm.deal(address(this), 10e18);
        predictronArena.placeBet{value: 5e15}(Side.Up);
        (uint256 upAmount, uint256 downAmount) = predictronArena.userBetsByRound(1, address(this));
        assertEq(upAmount, 5e15);
        assertEq(downAmount, 0);

        predictronArena.placeBet{value: 5e15}(Side.Down);
        (upAmount, downAmount) = predictronArena.userBetsByRound(1, address(this));
        assertEq(upAmount, 5e15);
        assertEq(downAmount, 5e15);

        predictronArena.placeBet{value: 5e15}(Side.Down);
        (upAmount, downAmount) = predictronArena.userBetsByRound(1, address(this));
        assertEq(upAmount, 5e15);
        assertEq(downAmount, 10e15);
    }

    function testStartRoundPreviousRoundNotEnded() public {
        vm.deal(address(this), 10e18);
        predictronArena.placeBet{value: 5e15}(Side.Up);
        predictronArena.startRound(Side.Up);

        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() - 1);
        predictronArena.placeBet{value: 5e15}(Side.Up);

        vm.expectRevert(PredictronArena.PredictronArena__PreviousRoundNotEnded.selector);
        predictronArena.startRound(Side.Up);
    }

    function testStartRoundNoPlayers() public {
        vm.deal(address(this), 10e18);
        vm.expectRevert(PredictronArena.PredictronArena__RoundWithoutBets.selector);
        predictronArena.startRound(Side.Down);
    }

    function testStartRoundRoleAccess() public {
        address randomUser = address(0xBEEF);
        vm.deal(randomUser, 10e18);

        predictronArena.placeBet{value: 5e15}(Side.Up);

        vm.prank(randomUser);
        vm.expectRevert();
        predictronArena.startRound(Side.Down);

        predictronArena.grantRole(predictronArena.ROUND_MANAGER_ROLE(), randomUser);

        vm.prank(randomUser);
        predictronArena.startRound(Side.Down);

        assertEq(predictronArena.currentRoundId(), 1);
    }

    function testEndRoundRoleAccess() public {
        address randomUser = address(0xBEEF);
        vm.deal(randomUser, 10e18);

        predictronArena.placeBet{value: 5e15}(Side.Up);
        predictronArena.startRound(Side.Down);
        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);

        vm.prank(randomUser);
        vm.expectRevert();
        predictronArena.endRound();

        predictronArena.grantRole(predictronArena.ROUND_MANAGER_ROLE(), randomUser);

        vm.prank(randomUser);
        predictronArena.endRound();

        assertEq(predictronArena.getRound(1).endPrice, 3e7);
    }

    function testEndRoundEarly() public {
        vm.deal(address(this), 10e18);
        predictronArena.placeBet{value: 5e15}(Side.Up);
        predictronArena.startRound(Side.Down);

        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() - 1);

        vm.expectRevert(PredictronArena.PredictronArena__RoundCannotBeEnded.selector);
        predictronArena.endRound();
    }

    function testEndRoundAlreadyEnded() public {
        vm.deal(address(this), 10e18);
        predictronArena.placeBet{value: 5e15}(Side.Up);
        predictronArena.startRound(Side.Down);

        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        predictronArena.endRound();

        vm.expectRevert(PredictronArena.PredictronArena__RoundAlreadyEnded.selector);
        predictronArena.endRound();
    }

    function testEndRoundNotStarted() public {
        vm.deal(address(this), 10e18);
        predictronArena.placeBet{value: 5e15}(Side.Up);

        vm.expectRevert(PredictronArena.PredictronArena__RoundNotStarted.selector);
        predictronArena.endRound();
    }

    function testThreeRoundsWithPlayers() public {
        for (uint256 round = 1; round <= 3; round++) {
            for (uint256 i = 0; i < players.length; i++) {
                vm.prank(players[i]);
                predictronArena.placeBet{value: 5e15}(Side.Up);
            }
            mockFeed.updateAnswer(int256(3e7 + round));
            predictronArena.startRound(Side.Up);

            vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);

            if (round == 2) {
                mockFeed.updateAnswer(int256(15e6 + round));
            } else {
                mockFeed.updateAnswer(int256(35e6 + round));
            }
            predictronArena.endRound();

            PredictronArena.Round memory r = predictronArena.getRound(round);
            assertEq(r.id, round);
            assertEq(r.startPrice, int256(3e7 + round));
            if (round == 2) {
                assertEq(r.endPrice, int256(15e6 + round));
            } else {
                assertEq(r.endPrice, int256(35e6 + round));
            }
            assertNotEq(r.endTs, 0);

            for (uint256 i = 0; i < players.length; i++) {
                (uint256 upAmount, uint256 downAmount) = predictronArena.userBetsByRound(round, players[i]);
                assertEq(upAmount, 5e15);
                assertEq(downAmount, 0);
            }
        }
    }

    function testRound1UpWins() public {
        Side[6] memory sides = [Side.Up, Side.Up, Side.Up, Side.Down, Side.Down, Side.Down];
        uint256[6] memory amounts =
            [uint256(10e15), uint256(20e15), uint256(30e15), uint256(15e15), uint256(25e15), uint256(35e15)];
        placeBets(sides, amounts);
        predictronArena.startRound(Side.Up);
        vm.prank(players[0]);
        vm.expectRevert(PredictronArena.PredictronArena__RoundNotEnded.selector);
        predictronArena.claim(1);
        mockFeed.updateAnswer(4e7);
        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        predictronArena.endRound();

        uint256 totalDown = amounts[3] + amounts[4] + amounts[5];
        assertEq(totalDown, 75e15);
        uint256 fee = (totalDown * predictronArena.PROTOCOL_FEE()) / 1e4;
        assertEq(fee, 15e14);

        for (uint256 i = 0; i < 6; i++) {
            bool isWinner = i < 3;
            claimReward(1, i, isWinner);
        }
        claimFees(fee);
    }

    function testRound1DownWins() public {
        Side[6] memory sides = [Side.Up, Side.Up, Side.Up, Side.Down, Side.Down, Side.Down];
        uint256[6] memory amounts =
            [uint256(10e15), uint256(20e15), uint256(30e15), uint256(15e15), uint256(25e15), uint256(35e15)];
        placeBets(sides, amounts);
        predictronArena.startRound(Side.Down);
        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        mockFeed.updateAnswer(2e7);
        predictronArena.endRound();

        uint256 totalUp = amounts[0] + amounts[1] + amounts[2];
        assertEq(totalUp, 60e15);
        uint256 fee = (totalUp * predictronArena.PROTOCOL_FEE()) / 1e4;
        uint256 protocolFee = predictronArena.calculateFee(1);
        assertEq(protocolFee, fee);
        assertEq(fee, 12e14);

        for (uint256 i = 0; i < 6; i++) {
            bool isWinner = i > 2;
            claimReward(1, i, isWinner);
        }
        claimFees(fee);
    }

    function testRound1NooneWins() public {
        Side[6] memory sides = [Side.Up, Side.Up, Side.Up, Side.Down, Side.Down, Side.Down];
        uint256[6] memory amounts =
            [uint256(10e15), uint256(20e15), uint256(30e15), uint256(15e15), uint256(25e15), uint256(35e15)];
        placeBets(sides, amounts);
        predictronArena.startRound(Side.Up);
        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        predictronArena.endRound();
        uint256 totalUp = amounts[0] + amounts[1] + amounts[2];
        assertEq(totalUp, 60e15);
        uint256 totalDown = amounts[3] + amounts[4] + amounts[5];
        assertEq(totalDown, 75e15);
        uint256 fee = totalDown + totalUp;
        uint256 protocolFee = predictronArena.calculateFee(1);
        assertEq(fee, 135e15);
        assertEq(fee, protocolFee);

        for (uint256 i = 0; i < 6; i++) {
            claimReward(1, i, false);
        }
        claimFees(fee);
    }

    function testRound1NooneWins2() public {
        Side[6] memory sides = [Side.Up, Side.Up, Side.Up, Side.Up, Side.Up, Side.Up];
        uint256[6] memory amounts =
            [uint256(10e15), uint256(20e15), uint256(30e15), uint256(15e15), uint256(25e15), uint256(35e15)];
        placeBets(sides, amounts);
        predictronArena.startRound(Side.Up);
        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        mockFeed.updateAnswer(3e7 - 1);
        predictronArena.endRound();
        uint256 totalUp = amounts[0] + amounts[1] + amounts[2] + amounts[3] + amounts[4] + amounts[5];
        assertEq(totalUp, 135e15);
        uint256 fee = totalUp;
        uint256 protocolFee = predictronArena.calculateFee(1);
        assertEq(fee, 135e15);
        assertEq(fee, protocolFee);

        for (uint256 i = 0; i < 6; i++) {
            claimReward(1, i, false);
        }
        claimFees(fee);
    }

    function placeBets(Side[6] memory sides, uint256[6] memory amounts) internal {
        for (uint256 i = 0; i < 6; i++) {
            vm.prank(players[i]);
            predictronArena.placeBet{value: amounts[i]}(sides[i]);
        }
    }

    function claimReward(uint256 roundId, uint256 playerIdx, bool expectReward) internal {
        vm.startBroadcast(players[playerIdx]);
        if (expectReward) {
            uint256 payout = predictronArena.calculateReward(roundId, players[playerIdx]);
            uint256 balanceBefore = players[playerIdx].balance;
            predictronArena.claim(roundId);
            uint256 balanceAfter = players[playerIdx].balance;
            assertEq(balanceAfter - balanceBefore, payout, "Winner did not receive correct payout");

            vm.expectRevert(PredictronArena.PredictronArena__AlreadyClaimed.selector);
            predictronArena.claim(roundId);
        } else {
            vm.expectRevert(PredictronArena.PredictronArena__NoReward.selector);
            predictronArena.claim(roundId);
        }
        vm.stopBroadcast();
    }

    function claimFees(uint256 expectedFee) internal {
        uint256 balanceBefore = address(this).balance;
        predictronArena.claimProtocolFees();
        uint256 balanceAfter = address(this).balance;
        assertEq(balanceAfter - balanceBefore, expectedFee, "Owner did not receive correct fee");

        vm.expectRevert(PredictronArena.PredictronArena__NoReward.selector);
        predictronArena.claimProtocolFees();
    }

    function testGetRound() public view {
        assertEq(predictronArena.getRound(0).id, 0);
    }

    function testGetCurrentRound() public view {
        assertEq(predictronArena.getCurrentRound().id, 0);
    }

    function testGetLatestPrice() public view {
        assertEq(predictronArena.getLatestPrice(), 3e7);
    }

    function test_PauseStopsActions() public {
        predictronArena.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        predictronArena.placeBet{value: 5e15}(Side.Up);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        predictronArena.startRound(Side.Down);
        predictronArena.unpause();
        predictronArena.placeBet{value: 5e15}(Side.Up);
    }

    receive() external payable {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PredictronArena, Side} from "../contracts/PredictronArena.sol";
import {HederaHelperConfig} from "../script/HederaHelperConfig.s.sol";
import {MockV3Aggregator} from "../test/mock/MockV3Aggregator.sol";
import {Test} from "forge-std/Test.sol";

contract PredictronArenaTest is Test {
    PredictronArena public predictronArena;
    HederaHelperConfig public hederaHelperConfig;
    MockV3Aggregator public mockFeed;
    address[6] public players;

    function setUp() public {
        hederaHelperConfig = new HederaHelperConfig();
        uint256 chainId = block.chainid;
        HederaHelperConfig.NetworkConfig memory networkConfig = hederaHelperConfig.getConfigByChainId(chainId);
        predictronArena = new PredictronArena(address(this), networkConfig.priceFeed);
        mockFeed = MockV3Aggregator(address(predictronArena.priceFeed()));
        for (uint256 i = 0; i < 6; i++) {
            players[i] = vm.addr(i + 1);
            vm.deal(players[i], 1000e8); // Fund each player with 10 HBAR equivalent
        }
    }

    function testPlaceBetMinBetNotMet() public {
        vm.expectRevert(PredictronArena.PredictronArena__MinBetNotMet.selector);
        predictronArena.placeBet{value: 1e8}(Side.Up);
    }

    function testPlaceBetInvalidSide() public {
        vm.expectRevert(PredictronArena.PredictronArena__InvalidSide.selector);
        predictronArena.placeBet{value: 5e8}(Side.None);
    }

    function testPlaceBetBetUpDown() public {
        vm.deal(address(this), 10e18);
        predictronArena.placeBet{value: 5e8}(Side.Up);
        (uint256 upAmount, uint256 downAmount) = predictronArena.userBetsByRound(1, address(this));
        assertEq(upAmount, 5e8);
        assertEq(downAmount, 0);

        predictronArena.placeBet{value: 5e8}(Side.Down);
        (upAmount, downAmount) = predictronArena.userBetsByRound(1, address(this));
        assertEq(upAmount, 5e8);
        assertEq(downAmount, 5e8);

        predictronArena.placeBet{value: 5e8}(Side.Down);
        (upAmount, downAmount) = predictronArena.userBetsByRound(1, address(this));
        assertEq(upAmount, 5e8);
        assertEq(downAmount, 10e8);
    }

    function testStartRoundPreviousRoundNotEnded() public {
        vm.deal(address(this), 10e18);
        predictronArena.placeBet{value: 5e8}(Side.Up);
        predictronArena.startRound(Side.Up, Side.Down);

        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() - 1);
        predictronArena.placeBet{value: 5e8}(Side.Up);

        vm.expectRevert(PredictronArena.PredictronArena__PreviousRoundNotEnded.selector);
        predictronArena.startRound(Side.Down, Side.Down);
    }

    function testStartRoundNoPlayers() public {
        vm.deal(address(this), 10e18);
        vm.expectRevert(PredictronArena.PredictronArena__RoundWithoutBets.selector);
        predictronArena.startRound(Side.Up, Side.Down);
    }

    function testStartRoundRoleAccess() public {
        address randomUser = address(0xBEEF);
        vm.deal(randomUser, 10e18);

        predictronArena.placeBet{value: 5e8}(Side.Up);

        vm.prank(randomUser);
        vm.expectRevert();
        predictronArena.startRound(Side.Up, Side.Down);

        predictronArena.grantRole(predictronArena.ROUND_MANAGER_ROLE(), randomUser);

        vm.prank(randomUser);
        predictronArena.startRound(Side.Up, Side.Up);

        assertEq(predictronArena.currentRoundId(), 1);
    }

    function testEndRoundRoleAccess() public {
        address randomUser = address(0xBEEF);
        vm.deal(randomUser, 10e18);

        predictronArena.placeBet{value: 5e8}(Side.Up);
        predictronArena.startRound(Side.Up, Side.Down);
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
        predictronArena.placeBet{value: 5e8}(Side.Up);
        predictronArena.startRound(Side.Down, Side.Up);

        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() - 1);

        vm.expectRevert(PredictronArena.PredictronArena__RoundCannotBeEnded.selector);
        predictronArena.endRound();
    }

    function testEndRoundAlreadyEnded() public {
        vm.deal(address(this), 10e18);
        predictronArena.placeBet{value: 5e8}(Side.Up);
        predictronArena.startRound(Side.Down, Side.Down);

        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        predictronArena.endRound();

        vm.expectRevert(PredictronArena.PredictronArena__RoundAlreadyEnded.selector);
        predictronArena.endRound();
    }

    function testEndRoundNotStarted() public {
        vm.deal(address(this), 10e18);
        predictronArena.placeBet{value: 5e8}(Side.Up);

        vm.expectRevert(PredictronArena.PredictronArena__RoundNotStarted.selector);
        predictronArena.endRound();
    }

    function testThreeRoundsWithPlayers() public {
        for (uint256 round = 1; round <= 3; round++) {
            for (uint256 i = 0; i < players.length; i++) {
                vm.prank(players[i]);
                predictronArena.placeBet{value: 5e8}(Side.Up);
            }
            mockFeed.updateAnswer(int256(3e7 + round));
            predictronArena.startRound(Side.Up, Side.Down);

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
                assertEq(upAmount, 5e8);
                assertEq(downAmount, 0);
            }
        }
    }

    function testRound1UpWins() public {
        Side[6] memory sides = [Side.Up, Side.Up, Side.Up, Side.Down, Side.Down, Side.Down];
        uint256[6] memory amounts =
            [uint256(10e8), uint256(20e8), uint256(30e8), uint256(15e8), uint256(25e8), uint256(35e8)];
        placeBets(sides, amounts);
        predictronArena.startRound(Side.Up, Side.Down);
        vm.prank(players[0]);
        vm.expectRevert(PredictronArena.PredictronArena__RoundNotEnded.selector);
        predictronArena.claim(1);
        mockFeed.updateAnswer(4e7);
        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        predictronArena.endRound();

        uint256 totalDown = amounts[3] + amounts[4] + amounts[5];
        assertEq(totalDown, 75e8);
        uint256 fee = (totalDown * predictronArena.PROTOCOL_FEE()) / 10000;
        assertEq(fee, 150000000);

        for (uint256 i = 0; i < 6; i++) {
            bool isWinner = i < 3;
            claimReward(1, i, isWinner);
        }
        claimFees(fee);
    }

    function testRound1DownWins() public {
        Side[6] memory sides = [Side.Up, Side.Up, Side.Up, Side.Down, Side.Down, Side.Down];
        uint256[6] memory amounts =
            [uint256(10e8), uint256(20e8), uint256(30e8), uint256(15e8), uint256(25e8), uint256(35e8)];
        placeBets(sides, amounts);
        predictronArena.startRound(Side.Down, Side.Down);
        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        mockFeed.updateAnswer(2e7); // Price goes down
        predictronArena.endRound();

        uint256 totalUp = amounts[0] + amounts[1] + amounts[2];
        assertEq(totalUp, 60e8);
        uint256 fee = (totalUp * predictronArena.PROTOCOL_FEE()) / 10000;
        uint256 protocolFee = predictronArena.calculateFee(1);
        assertEq(protocolFee, fee);
        assertEq(fee, 120000000);

        for (uint256 i = 0; i < 6; i++) {
            bool isWinner = i > 2;
            claimReward(1, i, isWinner);
        }
        claimFees(fee);
    }

    function testRound1NooneWins() public {
        Side[6] memory sides = [Side.Up, Side.Up, Side.Up, Side.Down, Side.Down, Side.Down];
        uint256[6] memory amounts =
            [uint256(10e8), uint256(20e8), uint256(30e8), uint256(15e8), uint256(25e8), uint256(35e8)];
        placeBets(sides, amounts);
        predictronArena.startRound(Side.Up, Side.Up);
        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        predictronArena.endRound();
        uint256 totalUp = amounts[0] + amounts[1] + amounts[2];
        assertEq(totalUp, 60e8);
        uint256 totalDown = amounts[3] + amounts[4] + amounts[5];
        assertEq(totalDown, 75e8);
        uint256 fee = totalDown + totalUp;
        uint256 protocolFee = predictronArena.calculateFee(1);
        assertEq(fee, 13500000000);
        assertEq(fee, protocolFee);

        for (uint256 i = 0; i < 6; i++) {
            claimReward(1, i, false);
        }
        claimFees(fee);
    }

    function testRound1NooneWins2() public {
        Side[6] memory sides = [Side.Up, Side.Up, Side.Up, Side.Up, Side.Up, Side.Up];
        uint256[6] memory amounts =
            [uint256(10e8), uint256(20e8), uint256(30e8), uint256(15e8), uint256(25e8), uint256(35e8)];
        placeBets(sides, amounts);
        predictronArena.startRound(Side.Up, Side.Down);
        vm.warp(block.timestamp + predictronArena.ROUND_INTERVAL() + 1);
        mockFeed.updateAnswer(3e7 - 1);
        predictronArena.endRound();
        uint256 totalUp = amounts[0] + amounts[1] + amounts[2] + amounts[3] + amounts[4] + amounts[5];
        assertEq(totalUp, 135e8);
        uint256 fee = totalUp;
        uint256 protocolFee = predictronArena.calculateFee(1);
        assertEq(fee, 13500000000);
        assertEq(fee, protocolFee);

        for (uint256 i = 0; i < 6; i++) {
            claimReward(1, i, false);
        }
        claimFees(fee);
    }

    // Helper for placing bets
    function placeBets(Side[6] memory sides, uint256[6] memory amounts) internal {
        for (uint256 i = 0; i < 6; i++) {
            vm.prank(players[i]);
            predictronArena.placeBet{value: amounts[i]}(sides[i]);
        }
    }

    // Helper for claiming rewards
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

    // Helper for claiming protocol fees
    function claimFees(uint256 expectedFee) internal {
        uint256 balanceBefore = address(this).balance;
        predictronArena.claimProtocolFees();
        uint256 balanceAfter = address(this).balance;
        assertEq(balanceAfter - balanceBefore, expectedFee, "Owner did not receive correct fee");

        // Try to claim again, should revert
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

    receive() external payable {}
}

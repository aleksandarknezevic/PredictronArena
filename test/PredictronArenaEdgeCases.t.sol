// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PredictronArena, Side} from "../contracts/PredictronArena.sol";
import {HelperConfig} from "../script/HelperConfig.s.sol";
import {MockV3Aggregator} from "../contracts/mocks/MockV3Aggregator.sol";
import {Test} from "forge-std/Test.sol";

contract PredictronArenaEdgeCasesTest is Test {
    PredictronArena public arena;
    MockV3Aggregator public mockFeed;
    HelperConfig public config;

    address public owner = address(this);
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    uint256 constant MIN_BET = 5e15;
    uint256 constant LARGE_BET = 1e18;
    uint256 constant MAX_BET = 1e20;

    event BetPlaced(uint256 indexed roundId, address indexed user, uint256 amount, Side side);
    event RoundStarted(uint256 indexed roundId, uint256 startTs, int256 startPrice);
    event RoundEnded(uint256 indexed roundId, uint256 endTs, int256 endPrice, Side result);

    function setUp() public {
        config = new HelperConfig();
        uint256 chainId = block.chainid;
        HelperConfig.NetworkConfig memory networkConfig = config.getConfigByChainId(chainId);
        arena = new PredictronArena(
            owner,
            networkConfig.priceFeed,
            0x0000000000000000000000000000000000000000,
            bytes32("fun-ethereum-sepolia-1")
        );
        mockFeed = MockV3Aggregator(address(arena.PRICE_FEED()));

        vm.deal(alice, 100000e15);
        vm.deal(bob, 100000e15);
        vm.deal(charlie, 100000e15);
    }

    function testMaxBetAmount() public {
        vm.startPrank(alice);

        arena.placeBet{value: MAX_BET}(Side.Up);

        (uint256 upAmount, uint256 downAmount) = arena.userBetsByRound(1, alice);
        assertEq(upAmount, MAX_BET);
        assertEq(downAmount, 0);

        vm.stopPrank();
    }

    function testAsymmetricBetting() public {
        vm.prank(alice);
        arena.placeBet{value: MAX_BET}(Side.Up);

        vm.prank(bob);
        arena.placeBet{value: MIN_BET}(Side.Down);

        arena.startRound(Side.Up);
        mockFeed.updateAnswer(2e7);

        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);
        arena.endRound();

        uint256 bobReward = arena.calculateReward(1, bob);
        assertGt(bobReward, MIN_BET);

        uint256 aliceReward = arena.calculateReward(1, alice);
        assertEq(aliceReward, 0);
    }

    function testExactTie() public {
        vm.prank(alice);
        arena.placeBet{value: 100e15}(Side.Up);

        vm.prank(bob);
        arena.placeBet{value: 100e15}(Side.Down);

        int256 startPrice = arena.getLatestPrice();
        arena.startRound(Side.Up);

        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);
        mockFeed.updateAnswer(startPrice);

        uint256 protocolFees = arena.calculateFee(1);
        assertEq(protocolFees, 200e15);

        assertEq(arena.calculateReward(1, alice), 0);
        assertEq(arena.calculateReward(1, bob), 0);
    }

    function testOnlyOneSideBets() public {
        vm.prank(alice);
        arena.placeBet{value: 100e15}(Side.Up);

        vm.prank(bob);
        arena.placeBet{value: 200e15}(Side.Up);

        arena.startRound(Side.Up);

        mockFeed.updateAnswer(4e7);
        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);
        arena.endRound();

        uint256 protocolFees = arena.calculateFee(1);
        assertEq(protocolFees, 0);

        assertEq(arena.calculateReward(1, alice), 99999999e9);
        assertEq(arena.calculateReward(1, bob), 199999998e9);
    }

    function testNegativePrice() public {
        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        mockFeed.updateAnswer(-1e7);
        arena.startRound(Side.Up);

        mockFeed.updateAnswer(-2e7);
        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);
        arena.endRound();

        PredictronArena.Round memory round = arena.getRound(1);
        assertEq(round.startPrice, -1e7);
        assertEq(round.endPrice, -2e7);
        assertEq(uint256(round.winningSide), uint256(Side.Down));
    }

    function testZeroPrice() public {
        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        mockFeed.updateAnswer(0);
        arena.startRound(Side.Up);

        mockFeed.updateAnswer(1);
        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);
        arena.endRound();

        PredictronArena.Round memory round = arena.getRound(1);
        assertEq(round.startPrice, 0);
        assertEq(round.endPrice, 1);
        assertEq(uint256(round.winningSide), uint256(Side.Up));
    }

    function testMaxInt256Price() public {
        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        int256 maxPrice = type(int256).max;
        mockFeed.updateAnswer(maxPrice);
        arena.startRound(Side.Up);

        mockFeed.updateAnswer(maxPrice - 1);
        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);
        arena.endRound();

        PredictronArena.Round memory round = arena.getRound(1);
        assertEq(round.startPrice, maxPrice);
        assertEq(round.endPrice, maxPrice - 1);
        assertEq(uint256(round.winningSide), uint256(Side.Down));
    }

    function testRoundEndExactlyAtInterval() public {
        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        arena.startRound(Side.Up);
        uint256 startTime = block.timestamp;

        vm.warp(startTime + arena.ROUND_INTERVAL());
        arena.endRound();

        PredictronArena.Round memory round = arena.getRound(1);
        assertTrue(round.endTs > 0);
    }

    function testRoundEndOneSecondEarly() public {
        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        arena.startRound(Side.Up);
        uint256 startTime = block.timestamp;

        vm.warp(startTime + arena.ROUND_INTERVAL() - 1);
        vm.expectRevert(PredictronArena.PredictronArena__RoundCannotBeEnded.selector);
        arena.endRound();
    }

    function testRevokeRoundManagerRole() public {
        address manager = makeAddr("manager");

        arena.grantRole(arena.ROUND_MANAGER_ROLE(), manager);

        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        vm.prank(manager);
        arena.startRound(Side.Up);

        arena.revokeRole(arena.ROUND_MANAGER_ROLE(), manager);

        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);

        vm.prank(manager);
        vm.expectRevert();
        arena.endRound();
    }

    function testMultipleRoundManagersConflict() public {
        address manager1 = makeAddr("manager1");
        address manager2 = makeAddr("manager2");

        arena.grantRole(arena.ROUND_MANAGER_ROLE(), manager1);
        arena.grantRole(arena.ROUND_MANAGER_ROLE(), manager2);

        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        vm.prank(manager1);
        arena.startRound(Side.Up);

        vm.prank(bob);
        arena.placeBet{value: MIN_BET}(Side.Down);

        vm.prank(manager2);
        vm.expectRevert(PredictronArena.PredictronArena__PreviousRoundNotEnded.selector);
        arena.startRound(Side.Down);
    }

    function testClaimReentrancy() public {
        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        vm.prank(bob);
        arena.placeBet{value: MIN_BET}(Side.Down);

        arena.startRound(Side.Up);
        mockFeed.updateAnswer(4e7);

        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);
        arena.endRound();

        vm.prank(alice);
        arena.claim(1);

        vm.prank(alice);
        vm.expectRevert(PredictronArena.PredictronArena__AlreadyClaimed.selector);
        arena.claim(1);
    }

    function testMassiveBetArray() public {
        for (uint256 i = 0; i < 50; i++) {
            address user = address(uint160(0x1000 + i));
            vm.deal(user, 10e18);
            vm.prank(user);
            arena.placeBet{value: MIN_BET}(Side.Up);
        }

        arena.startRound(Side.Up);

        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);

        arena.endRound();
    }

    function testPauseInMiddleOfRound() public {
        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        arena.startRound(Side.Up);

        arena.pause();

        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);
        arena.endRound();

        arena.unpause();

        arena.pause();
        vm.prank(alice);
        vm.expectRevert();
        arena.claim(1);
    }

    function testDivisionByZeroInRewardCalculation() public {
        vm.prank(alice);
        arena.placeBet{value: MIN_BET}(Side.Up);

        arena.startRound(Side.Up);
        mockFeed.updateAnswer(4e7);

        vm.warp(block.timestamp + arena.ROUND_INTERVAL() + 1);
        arena.endRound();

        uint256 reward = arena.calculateReward(1, alice);
        assertGt(reward, 0);
    }

    receive() external payable {}
}


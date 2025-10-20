import assert from "assert";
import { 
  TestHelpers,
  Round,
  UserRound
} from "generated";
const { MockDb, PredictronArena } = TestHelpers;

describe("PredictronArena contract BetPlaced event tests", () => {
  // Create mock db
  const mockDb = MockDb.createMockDb();

  // Creating mock for PredictronArena contract BetPlaced event
  const event = PredictronArena.BetPlaced.createMockEvent({
    roundId: 1n,
    user: "0x1234567890123456789012345678901234567890",
    amount: 1000000000000000000n, // 1 ETH
    side: 1n, // Up
  });

  it("Round and UserRound entities are created correctly on BetPlaced", async () => {
    // Processing the event
    const mockDbUpdated = await PredictronArena.BetPlaced.processEvent({
      event,
      mockDb,
    });

    // Check Round entity is created/updated
    const roundId = `${event.chainId}_${event.params.roundId}`;
    let actualRound = mockDbUpdated.entities.Round.get(roundId);
    
    assert.ok(actualRound, "Round entity should be created");
    assert.equal(actualRound.chainId, event.chainId);
    assert.equal(actualRound.roundId, event.params.roundId);
    assert.equal(actualRound.totalUp, event.params.amount);
    assert.equal(actualRound.totalDown, 0n);

    // Check UserRound entity is created
    const userRoundId = `${event.chainId}_${event.params.roundId}_${event.params.user.toLowerCase()}`;
    let actualUserRound = mockDbUpdated.entities.UserRound.get(userRoundId);
    
    assert.ok(actualUserRound, "UserRound entity should be created");
    assert.equal(actualUserRound.user, event.params.user);
    assert.equal(actualUserRound.upAmount, event.params.amount);
    assert.equal(actualUserRound.downAmount, 0n);
  });
});

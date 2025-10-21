// src/EventHandlers.ts
import { PredictronArena } from "generated";

const PROTOCOL_FEE_BPS = 200n;
const PROTOCOL_FEE_PRECISION = 10000n;
const PRECISION = 100000000n;

function idRound(chainId: number, roundId: bigint) {
  return `${chainId}_${roundId}`;
}
function idUserRound(chainId: number, roundId: bigint, user: string) {
  return `${chainId}_${roundId}_${user.toLowerCase()}`;
}
function idUser(chainId: number, user: string) {
  return `${chainId}_${user.toLowerCase()}`;
}
function idAi(chainId: number) {
  return `${chainId}`;
}
function idRoundParticipant(chainId: number, roundId: bigint, user: string) {
  return `${chainId}_${roundId}_${user.toLowerCase()}`;
}

function computeUserGrossReward(
  winningSide: number, // 0 None, 1 Up, 2 Down
  userUp: bigint,
  userDown: bigint,
  totalUp: bigint,
  totalDown: bigint
): bigint {
  if (winningSide === 0) return 0n;

  let totalWinning = 0n;
  let totalLosing = 0n;
  let userShare = 0n;

  if (winningSide === 1 && userUp > 0n) {
    totalWinning = totalUp;
    totalLosing = totalDown;
    userShare = (userUp * PRECISION) / (totalWinning === 0n ? 1n : totalWinning);
  } else if (winningSide === 2 && userDown > 0n) {
    totalWinning = totalDown;
    totalLosing = totalUp;
    userShare = (userDown * PRECISION) / (totalWinning === 0n ? 1n : totalWinning);
  } else {
    return 0n;
  }

  const fee =
    totalWinning === 0n
      ? totalLosing
      : (totalLosing * PROTOCOL_FEE_BPS) / PROTOCOL_FEE_PRECISION;

  const rewardPool = totalLosing - fee;
  const totalPayout = totalWinning + rewardPool;

  return (userShare * totalPayout) / PRECISION;
}

PredictronArena.BetPlaced.handler(async ({ event, context }) => {
  const currentRoundId = event.params.roundId;
  
  for (let prevRoundId = 1n; prevRoundId < currentRoundId; prevRoundId++) {
    await processUserRoundResult(
      context,
      event.chainId,
      prevRoundId,
      event.params.user
    );
  }
  
  console.log(`BetPlaced: Processed all ${currentRoundId - 1n} previous rounds for user ${event.params.user}`);

  const roundKey = idRound(event.chainId, event.params.roundId);
  const roundPrev = await context.Round.get(roundKey);
  const isUp = Number(event.params.side) === 1;

  // Add participant to the list if not already there
  const userLower = event.params.user.toLowerCase();
  const existingParticipants = roundPrev?.participants ?? "";
  const participantsList = existingParticipants ? existingParticipants.split(",").filter((p: string) => p) : [];
  if (!participantsList.includes(userLower)) {
    participantsList.push(userLower);
  }

  const nextRound = {
    id: roundKey,
    chainId: event.chainId,
    roundId: event.params.roundId,
    startTs: roundPrev?.startTs,
    endTs: roundPrev?.endTs,
    startPrice: roundPrev?.startPrice,
    endPrice: roundPrev?.endPrice,
    aiPrediction: roundPrev?.aiPrediction,
    result: roundPrev?.result,
    totalUp: (roundPrev?.totalUp ?? 0n) + (isUp ? (event.params.amount as bigint) : 0n),
    totalDown: (roundPrev?.totalDown ?? 0n) + (!isUp ? (event.params.amount as bigint) : 0n),
    protocolFeeBps: roundPrev?.protocolFeeBps ?? Number(PROTOCOL_FEE_BPS),
    protocolFeePrecision: roundPrev?.protocolFeePrecision ?? PROTOCOL_FEE_PRECISION,
    participants: participantsList.length > 0 ? participantsList.join(",") : undefined,
  };
  context.Round.set(nextRound);

  const urKey = idUserRound(event.chainId, event.params.roundId, event.params.user);
  const urPrev = await context.UserRound.get(urKey);

  const upAmount = (urPrev?.upAmount ?? 0n) + (isUp ? (event.params.amount as bigint) : 0n);
  const downAmount = (urPrev?.downAmount ?? 0n) + (!isUp ? (event.params.amount as bigint) : 0n);

  const nextUR = {
    id: urKey,
    chainId: event.chainId,
    roundId: event.params.roundId,
    user: event.params.user,
    upAmount,
    downAmount,
    totalBet: upAmount + downAmount,
    side: isUp ? 1 : 2,
    grossReward: urPrev?.grossReward ?? 0n,
    netPnl: urPrev?.netPnl ?? 0n,
    won: urPrev?.won ?? false,
    claimed: urPrev?.claimed ?? false,
  };
  context.UserRound.set(nextUR);

  const rpKey = idRoundParticipant(event.chainId, event.params.roundId, event.params.user);
  context.RoundParticipant.set({
    id: rpKey,
    chainId: event.chainId,
    roundId: event.params.roundId,
    user: event.params.user,
    processedResults: false
  });

  // UserStats (don't count rounds until they're complete)
  const uKey = idUser(event.chainId, event.params.user);
  const usPrev = await context.UserStats.get(uKey);

  const nextUS = {
    id: uKey,
    chainId: event.chainId,
    user: event.params.user,
    roundsPlayed: usPrev?.roundsPlayed ?? 0, 
    wins: usPrev?.wins ?? 0,
    losses: usPrev?.losses ?? 0,
    pushes: usPrev?.pushes ?? 0,
    totalBet: (usPrev?.totalBet ?? 0n) + (event.params.amount as bigint),
    totalGrossRewards: usPrev?.totalGrossRewards ?? 0n,
    totalNetPnl: usPrev?.totalNetPnl ?? 0n,
    winRate: usPrev?.winRate ?? 0, // Keep existing win rate, don't recalculate here
  };
  
  context.UserStats.set(nextUS);

  context.LeaderboardRow.set({
    id: uKey,
    chainId: nextUS.chainId,
    user: nextUS.user,
    totalNetPnl: nextUS.totalNetPnl,
    winRate: nextUS.winRate,
    roundsPlayed: nextUS.roundsPlayed,
  });
});


PredictronArena.RewardClaimed.handler(async ({ event, context }) => {
  const claimedRoundId = event.params.roundId;
  for (let prevRoundId = 1n; prevRoundId <= claimedRoundId; prevRoundId++) {
    await processUserRoundResult(
      context,
      event.chainId,
      prevRoundId,
      event.params.user
    );
  }
  
  const recentRounds = Math.max(1, Number(claimedRoundId) - 2);
  for (let roundId = BigInt(recentRounds); roundId <= claimedRoundId; roundId++) {
    await processUserRoundResult(context, event.chainId, roundId, event.params.user);
    console.log(`RewardClaimed: Processed Round ${roundId} for user ${event.params.user}`);
  }

  const urKey = idUserRound(event.chainId, event.params.roundId, event.params.user);
  const urCurrent = await context.UserRound.get(urKey);
  
  if (urCurrent) {
    context.UserRound.set({
      ...urCurrent,
      claimed: true,
    });
  }
});

/** ------------------- ProcessRoundResults (Helper Function) ------------------- */
// This function updates UserRound records when someone interacts with a finished round
// We call this from RewardClaimed or when users check their results
async function processUserRoundResult(
  context: any,
  chainId: number,
  roundId: bigint,
  user: string
): Promise<void> {
  const urKey = idUserRound(chainId, roundId, user);
  const urPrev = await context.UserRound.get(urKey);
  
  if (urPrev) {
    const roundKey = idRound(chainId, roundId);
    const round = await context.Round.get(roundKey);
    
    if (round && round.result !== undefined && round.endTs) {
      const gross = computeUserGrossReward(
        round.result,
        urPrev.upAmount,
        urPrev.downAmount,
        round.totalUp,
        round.totalDown
      );
      const totalBet = urPrev.upAmount + urPrev.downAmount;
      const net = gross - totalBet;
      const won = net > 0n;

      context.UserRound.set({
        ...urPrev,
        grossReward: gross,
        netPnl: net,
        won,
        totalBet,
      });

      const rpKey = idRoundParticipant(chainId, roundId, user);
      const roundParticipant = await context.RoundParticipant.get(rpKey);
      const hasBeenProcessed = roundParticipant?.processedResults ?? false;
      
      if (!hasBeenProcessed) {
        const uKey = idUser(chainId, user);
        const usPrev = await context.UserStats.get(uKey);
        
        if (usPrev) {
          const usNext = { ...usPrev };
          
          usNext.roundsPlayed = usPrev.roundsPlayed + 1;
          
          if (round.result === 0) {
            usNext.pushes = usPrev.pushes + 1;
          } else if (won) {
            usNext.wins = usPrev.wins + 1;
            usNext.totalGrossRewards = usPrev.totalGrossRewards + gross;
          } else {
            usNext.losses = usPrev.losses + 1;
          }
          usNext.totalNetPnl = usPrev.totalNetPnl + net;
          
          const completedRounds = usNext.wins + usNext.losses + usNext.pushes;
          usNext.winRate = completedRounds > 0 ? usNext.wins / completedRounds : 0;

          context.UserStats.set(usNext);

          context.LeaderboardRow.set({
            id: uKey,
            chainId: usNext.chainId,
            user: usNext.user,
            totalNetPnl: usNext.totalNetPnl,
            winRate: usNext.winRate,
            roundsPlayed: usNext.roundsPlayed,
          });
        }
        if (roundParticipant) {
          context.RoundParticipant.set({
            ...roundParticipant,
            processedResults: true
          });
        }
      }
    }
  }
}

PredictronArena.RoundStarted.handler(async ({ event, context }) => {
  const key = idRound(event.chainId, event.params.roundId);
  const prev = await context.Round.get(key);

  const next = {
    id: key,
    chainId: event.chainId,
    roundId: event.params.roundId,
    startTs: event.params.startTs,
    startPrice: event.params.startPrice,
    endTs: prev?.endTs,
    endPrice: prev?.endPrice,
    aiPrediction: prev?.aiPrediction,
    result: prev?.result,
    totalUp: prev?.totalUp ?? 0n,
    totalDown: prev?.totalDown ?? 0n,
    protocolFeeBps: prev?.protocolFeeBps ?? Number(PROTOCOL_FEE_BPS),
    protocolFeePrecision: prev?.protocolFeePrecision ?? PROTOCOL_FEE_PRECISION,
    participants: prev?.participants,
  };
  context.Round.set(next);

  const aiKey = idAi(event.chainId);
  const aiPrev = await context.AiStats.get(aiKey);
  context.AiStats.set(
    aiPrev ?? {
      id: aiKey,
      chainId: event.chainId,
      roundsWithPrediction: 0,
      correct: 0,
      incorrect: 0,
      pushes: 0,
      accuracy: 0,
    }
  );
});

PredictronArena.ExternalPredictionAdded.handler(async ({ event, context }) => {
  const key = idRound(event.chainId, event.params.roundId);
  const prev = await context.Round.get(key);

  context.Round.set({
    id: key,
    chainId: event.chainId,
    roundId: event.params.roundId,
    startTs: prev?.startTs,
    endTs: prev?.endTs,
    startPrice: prev?.startPrice,
    endPrice: prev?.endPrice,
    aiPrediction: Number(event.params.aiPrediction),
    result: prev?.result,
    totalUp: prev?.totalUp ?? 0n,
    totalDown: prev?.totalDown ?? 0n,
    protocolFeeBps: prev?.protocolFeeBps ?? Number(PROTOCOL_FEE_BPS),
    protocolFeePrecision: prev?.protocolFeePrecision ?? PROTOCOL_FEE_PRECISION,
    participants: prev?.participants,
  });

  const aiKey = idAi(event.chainId);
  const aiPrev = await context.AiStats.get(aiKey);
  if (!aiPrev) {
    context.AiStats.set({
      id: aiKey,
      chainId: event.chainId,
      roundsWithPrediction: 0,
      correct: 0,
      incorrect: 0,
      pushes: 0,
      accuracy: 0,
    });
  }
});

PredictronArena.RoundEnded.handler(async ({ event, context }) => {
  const key = idRound(event.chainId, event.params.roundId);
  const prev = await context.Round.get(key);

  const round = {
    id: key,
    chainId: event.chainId,
    roundId: event.params.roundId,
    startTs: prev?.startTs,
    startPrice: prev?.startPrice,
    endTs: event.params.endTs,
    endPrice: event.params.endPrice,
    aiPrediction: prev?.aiPrediction,
    result: Number(event.params.result),
    totalUp: prev?.totalUp ?? 0n,
    totalDown: prev?.totalDown ?? 0n,
    protocolFeeBps: prev?.protocolFeeBps ?? Number(PROTOCOL_FEE_BPS),
    protocolFeePrecision: prev?.protocolFeePrecision ?? PROTOCOL_FEE_PRECISION,
    participants: prev?.participants,
  };
  context.Round.set(round);

  const resultValue = Number(event.params.result);
  console.log(`Round ${event.params.roundId} ended with result ${resultValue} (${resultValue === 1 ? 'UP' : resultValue === 2 ? 'DOWN' : 'TIE'}).`);
  
  // Process rewards for all participants immediately
  const participants = round.participants ? round.participants.split(",").filter((p: string) => p) : [];
  console.log(`Processing rewards for ${participants.length} participants in Round ${event.params.roundId}...`);
  
  for (const participant of participants) {
    await processUserRoundResult(
      context,
      event.chainId,
      event.params.roundId,
      participant
    );
  }
  
  console.log(`Completed processing rewards for Round ${event.params.roundId}.`);


  if (round.aiPrediction !== undefined) {
    const aiKey = idAi(event.chainId);
    const aiPrev = await context.AiStats.get(aiKey);
    const base =
      aiPrev ??
      ({
        id: aiKey,
        chainId: event.chainId,
        roundsWithPrediction: 0,
        correct: 0,
        incorrect: 0,
        pushes: 0,
        accuracy: 0,
      } as const);

    const newRoundsWithPrediction = base.roundsWithPrediction + 1;
    
    let correct = base.correct;
    let incorrect = base.incorrect;
    let pushes = base.pushes;

    if ((round.result ?? 0) === 0) {
      pushes += 1;
    } else if (round.result === round.aiPrediction) {
      correct += 1;
    } else {
      incorrect += 1;
    }

    const accuracy = newRoundsWithPrediction > 0 ? correct / newRoundsWithPrediction : 0;

    context.AiStats.set({
      ...base,
      roundsWithPrediction: newRoundsWithPrediction,
      correct,
      incorrect,
      pushes,
      accuracy,
    });
  }
});

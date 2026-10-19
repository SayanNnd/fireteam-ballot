import type { Raid } from '../data/raids';
import defaultRaids from '../data/raids';

export interface VoteInput {
  raid_id: string;
  score: number;
}

export interface VetoInput {
  raid_id: string;
}

export interface HistoryInput {
  raid_id: string;
  picked_at?: string;
}

export interface PickResult {
  pickedRaid: Raid | null;
  weights: Record<string, number>;
  eligibleRaids: Raid[];
  vetoedRaidIds: string[];
}

/**
 * Pure function to calculate weighted pick for Destiny 2 raids.
 *
 * Rules:
 * 1. Vetoed raids are completely excluded from candidate pool.
 * 2. Each raid's weight = total vote score (floored at minimum 1 so non-voted raids still have a baseline chance).
 * 3. Recent history applies a decaying penalty (e.g., -50% for last played, -25% for 2nd last).
 * 4. Weights are strictly floored above zero (min 0.5) so no history penalty can push an eligible raid to 0.
 * 5. Returns null cleanly if all raids are vetoed.
 */
/**
 * Maps a player's 1-5 preference score into an accelerated priority weight.
 * This ensures that raids given TOP (5) priority significantly dominate
 * over default/neutral (3) or disliked (1) raids.
 */
export function getScoreWeight(score: number): number {
  const s = Number(score) || 0;
  if (s <= 1) return 0.05; // SKIP (1): 60x less likely than neutral
  if (s === 2) return 0.5;  // LOW (2): 6x less likely than neutral
  if (s === 3) return 3.0;  // MID (3): Neutral baseline
  if (s === 4) return 10.0; // HIGH (4): 3.3x more likely than neutral
  if (s >= 5) return 25.0; // TOP (5): 8.3x more likely than neutral, 500x more than SKIP
  // Fallback smooth interpolation for custom numeric values
  return Math.max(0.05, Math.min(25.0, Math.pow(s, 2.0)));
}

export function calculateRaidWeights(
  allRaids: Raid[] = defaultRaids,
  votes: VoteInput[] = [],
  vetoes: VetoInput[] = [],
  history: HistoryInput[] = []
): { eligibleRaids: Raid[]; weights: Record<string, number>; vetoedRaidIds: string[] } {
  // Deduplicate vetoed raid IDs
  const vetoedSet = new Set(
    vetoes
      .map((v) => v.raid_id?.trim().toLowerCase())
      .filter(Boolean)
  );

  const eligibleRaids = allRaids.filter((r) => !vetoedSet.has(r.id.toLowerCase()));
  const vetoedRaidIds = Array.from(vetoedSet);

  if (eligibleRaids.length === 0) {
    return { eligibleRaids: [], weights: {}, vetoedRaidIds };
  }

  // Aggregate non-linear priority weights per raid
  const scoreTotals: Record<string, number> = {};
  for (const raid of eligibleRaids) {
    scoreTotals[raid.id] = 0;
  }

  for (const vote of votes) {
    const rId = vote.raid_id?.trim().toLowerCase();
    if (rId && scoreTotals[rId] !== undefined) {
      const priorityWeight = getScoreWeight(vote.score);
      scoreTotals[rId] += priorityWeight;
    }
  }

  // Calculate history penalty multipliers
  // Sort history by picked_at descending if timestamps provided
  const validHistory = history
    .filter((h) => h.raid_id && !h.raid_id.startsWith('__')) // exclude internal heartbeats
    .map((h) => ({
      raid_id: h.raid_id.trim().toLowerCase(),
      time: h.picked_at ? new Date(h.picked_at).getTime() : 0,
    }));

  if (validHistory.some((h) => h.time > 0)) {
    validHistory.sort((a, b) => b.time - a.time);
  }

  // Recency penalty:
  // - 1 pick/reroll ago: 0.4x weight (-60% penalty)
  // - 2 picks/rerolls ago: 0.7x weight (-30% penalty)
  // - 3 or more picks/rerolls/revotes ago: 1.0x weight (penalty completely removed!)
  const historyPenalty: Record<string, number> = {};
  validHistory.slice(0, 2).forEach((h, index) => {
    if (historyPenalty[h.raid_id] === undefined) {
      const penalty = index === 0 ? 0.4 : 0.7;
      historyPenalty[h.raid_id] = penalty;
    }
  });

  // Compute final weights
  const weights: Record<string, number> = {};
  for (const raid of eligibleRaids) {
    const rawScore = scoreTotals[raid.id] ?? 0;
    // Base weight respects explicit votes down to 0.05 (SKIP), or 0.5 if unvoted
    const baseWeight = rawScore > 0 ? rawScore : 0.5;
    const multiplier = historyPenalty[raid.id] ?? 1.0;
    // Strict floor at 0.05: ensures disliked raids remain at minimal ~0.05 chance
    const finalWeight = Math.max(0.05, Number((baseWeight * multiplier).toFixed(2)));
    weights[raid.id] = finalWeight;
  }

  return { eligibleRaids, weights, vetoedRaidIds };
}

/**
 * Pure function: picks a raid according to weighted probabilities.
 */
export function pickRaid(
  allRaids: Raid[] = defaultRaids,
  votes: VoteInput[] = [],
  vetoes: VetoInput[] = [],
  history: HistoryInput[] = []
): PickResult {
  const { eligibleRaids, weights, vetoedRaidIds } = calculateRaidWeights(allRaids, votes, vetoes, history);

  if (eligibleRaids.length === 0) {
    return {
      pickedRaid: null,
      weights: {},
      eligibleRaids: [],
      vetoedRaidIds,
    };
  }

  // If only 1 raid is eligible, it wins 100%
  if (eligibleRaids.length === 1) {
    return {
      pickedRaid: eligibleRaids[0],
      weights,
      eligibleRaids,
      vetoedRaidIds,
    };
  }

  // Calculate cumulative sum
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

  if (totalWeight <= 0) {
    // Fallback: pick uniform random
    const randomIndex = Math.floor(Math.random() * eligibleRaids.length);
    return {
      pickedRaid: eligibleRaids[randomIndex],
      weights,
      eligibleRaids,
      vetoedRaidIds,
    };
  }

  const randomPoint = Math.random() * totalWeight;
  let runningSum = 0;
  let picked: Raid = eligibleRaids[0];

  for (const raid of eligibleRaids) {
    runningSum += weights[raid.id] || 0;
    if (randomPoint <= runningSum) {
      picked = raid;
      break;
    }
  }

  return {
    pickedRaid: picked,
    weights,
    eligibleRaids,
    vetoedRaidIds,
  };
}

export default pickRaid;

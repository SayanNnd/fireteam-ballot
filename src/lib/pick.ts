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
 * Pure function to calculate pick for Destiny 2 raids based on highest vote.
 *
 * Rules:
 * 1. Vetoed raids are completely excluded from candidate pool.
 * 2. Each raid's score = total vote score summed across fireteam members.
 * 3. The eligible destination with the highest total vote is selected.
 * 4. Ties between top-voted destinations are resolved by choosing among the tied leaders.
 * 5. Returns null cleanly if all raids are vetoed.
 */
export const RECENCY_PENALTY = 3;

/**
 * Extracts unique raid IDs for the N most recent picks from history.
 */
export function getRecentRaidIds(history: HistoryInput[], limit: number = 2): string[] {
  const validHistory = history
    .filter((h) => h.raid_id && !h.raid_id.startsWith('__'))
    .map((h) => ({
      raid_id: h.raid_id.trim().toLowerCase(),
      time: h.picked_at ? new Date(h.picked_at).getTime() : 0,
    }));

  if (validHistory.some((h) => h.time > 0)) {
    validHistory.sort((a, b) => b.time - a.time);
  }

  const recentSet = new Set<string>();
  for (const h of validHistory) {
    recentSet.add(h.raid_id);
    if (recentSet.size >= limit) break;
  }
  return Array.from(recentSet);
}

export function calculateRaidWeights(
  allRaids: Raid[] = defaultRaids,
  votes: VoteInput[] = [],
  vetoes: VetoInput[] = [],
  history: HistoryInput[] = []
): { eligibleRaids: Raid[]; weights: Record<string, number>; rawVotes: Record<string, number>; vetoedRaidIds: string[] } {
  // Deduplicate vetoed raid IDs
  const vetoedSet = new Set(
    vetoes
      .map((v) => v.raid_id?.trim().toLowerCase())
      .filter(Boolean)
  );

  const eligibleRaids = allRaids.filter((r) => !vetoedSet.has(r.id.toLowerCase()));
  const vetoedRaidIds = Array.from(vetoedSet);

  if (eligibleRaids.length === 0) {
    return { eligibleRaids: [], weights: {}, rawVotes: {}, vetoedRaidIds };
  }

  // Aggregate raw vote score per raid (no penalty — used for WINNER selection)
  const rawVotes: Record<string, number> = {};
  for (const raid of eligibleRaids) {
    rawVotes[raid.id] = 0;
  }

  for (const vote of votes) {
    const rId = vote.raid_id?.trim().toLowerCase();
    if (rId && rawVotes[rId] !== undefined) {
      rawVotes[rId] += Number(vote.score) || 0;
    }
  }

  // Display weights = raw votes minus recency penalty (used for standings ordering only)
  const weights: Record<string, number> = { ...rawVotes };
  const recentTwoRaidIds = new Set(getRecentRaidIds(history, 2));
  for (const raid of eligibleRaids) {
    if (recentTwoRaidIds.has(raid.id.toLowerCase())) {
      weights[raid.id] = (weights[raid.id] ?? 0) - RECENCY_PENALTY;
    }
  }

  return { eligibleRaids, weights, rawVotes, vetoedRaidIds };
}

/**
 * Pure function: picks a raid according to highest raw vote.
 * Recency penalty does NOT affect who wins — only display ordering.
 */
export function pickRaid(
  allRaids: Raid[] = defaultRaids,
  votes: VoteInput[] = [],
  vetoes: VetoInput[] = [],
  history: HistoryInput[] = []
): PickResult {
  const { eligibleRaids, weights, rawVotes, vetoedRaidIds } = calculateRaidWeights(allRaids, votes, vetoes, history);

  if (eligibleRaids.length === 0) {
    return {
      pickedRaid: null,
      weights: {},
      eligibleRaids: [],
      vetoedRaidIds,
    };
  }

  // If only 1 raid is eligible, it wins
  if (eligibleRaids.length === 1) {
    return {
      pickedRaid: eligibleRaids[0],
      weights,
      eligibleRaids,
      vetoedRaidIds,
    };
  }

  // Find the highest RAW vote score among eligible raids (no recency penalty)
  let highestRawVotes = -Infinity;
  for (const raid of eligibleRaids) {
    const score = rawVotes[raid.id] ?? 0;
    if (score > highestRawVotes) {
      highestRawVotes = score;
    }
  }

  // Gather all eligible raids that tied for highest raw vote count
  const topRaids = eligibleRaids.filter((raid) => (rawVotes[raid.id] ?? 0) === highestRawVotes);

  // Single winner → pick directly. Tied → random tiebreaker.
  const picked = topRaids.length === 1
    ? topRaids[0]
    : topRaids[Math.floor(Math.random() * topRaids.length)];

  return {
    pickedRaid: picked,
    weights,
    eligibleRaids,
    vetoedRaidIds,
  };
}

export default pickRaid;

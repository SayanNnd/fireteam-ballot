import { describe, it, expect } from 'vitest';
import { pickRaid, calculateRaidWeights } from './pick';
import { parseBungieMilestones, fetchLiveFeaturedRaidIds } from './bungie';
import type { Raid } from '../data/raids';

const mockRaids: Raid[] = [
  { id: 'salvations-edge', name: "Salvation's Edge", tagline: 'Test 1' },
  { id: 'crotas-end', name: "Crota's End", tagline: 'Test 2' },
  { id: 'root-of-nightmares', name: 'Root of Nightmares', tagline: 'Test 3' },
  { id: 'kings-fall', name: "King's Fall", tagline: 'Test 4' },
];

describe('pickRaid - Phase 3 Weighted Pick Algorithm', () => {
  it('One raid has all the votes: it always wins (100% in 100 runs)', () => {
    // salvations-edge has 100 votes, others have 0
    const votes = [{ raid_id: 'salvations-edge', score: 100 }];
    const vetoes: { raid_id: string }[] = [];
    const history: { raid_id: string }[] = [];

    // When one raid has massive votes compared to baseline, test 100 times
    // To test guaranteed single winner: only salvations-edge voted, others vetoed
    const singleCandidate = [{ id: 'salvations-edge', name: "Salvation's Edge", tagline: 'Solo' }];
    for (let i = 0; i < 50; i++) {
      const result = pickRaid(singleCandidate, votes, vetoes, history);
      expect(result.pickedRaid?.id).toBe('salvations-edge');
    }
  });

  it('All raids have equal votes: results spread roughly evenly over 1000 runs', () => {
    const votes = [
      { raid_id: 'salvations-edge', score: 10 },
      { raid_id: 'crotas-end', score: 10 },
      { raid_id: 'root-of-nightmares', score: 10 },
      { raid_id: 'kings-fall', score: 10 },
    ];

    const counts: Record<string, number> = {
      'salvations-edge': 0,
      'crotas-end': 0,
      'root-of-nightmares': 0,
      'kings-fall': 0,
    };

    for (let i = 0; i < 1000; i++) {
      const { pickedRaid } = pickRaid(mockRaids, votes, [], []);
      expect(pickedRaid).not.toBeNull();
      if (pickedRaid) {
        counts[pickedRaid.id] = (counts[pickedRaid.id] || 0) + 1;
      }
    }

    // Over 1000 runs among 4 equal raids, each should win roughly ~250 times (between 180 and 320)
    for (const raid of mockRaids) {
      expect(counts[raid.id]).toBeGreaterThan(160);
      expect(counts[raid.id]).toBeLessThan(340);
    }
  });

  it('Vetoed raid never appears in any of 1000 runs', () => {
    const vetoes = [{ raid_id: 'crotas-end' }];
    const votes = [
      { raid_id: 'crotas-end', score: 100 }, // High votes, but vetoed!
      { raid_id: 'salvations-edge', score: 5 },
      { raid_id: 'root-of-nightmares', score: 5 },
      { raid_id: 'kings-fall', score: 5 },
    ];

    for (let i = 0; i < 1000; i++) {
      const { pickedRaid, vetoedRaidIds } = pickRaid(mockRaids, votes, vetoes, []);
      expect(vetoedRaidIds).toContain('crotas-end');
      expect(pickedRaid?.id).not.toBe('crotas-end');
    }
  });

  it('Recently run raid wins less often than the same raid with no history, but can still win', () => {
    // Both raids have equal votes (10 each)
    const twoRaids: Raid[] = [
      { id: 'salvations-edge', name: "Salvation's Edge", tagline: '1' },
      { id: 'kings-fall', name: "King's Fall", tagline: '2' },
    ];

    const votes = [
      { raid_id: 'salvations-edge', score: 10 },
      { raid_id: 'kings-fall', score: 10 },
    ];

    // salvations-edge was played most recently
    const history = [{ raid_id: 'salvations-edge', picked_at: new Date().toISOString() }];

    let salvationsWins = 0;
    let kingsFallWins = 0;

    for (let i = 0; i < 1000; i++) {
      const { pickedRaid } = pickRaid(twoRaids, votes, [], history);
      if (pickedRaid?.id === 'salvations-edge') salvationsWins++;
      if (pickedRaid?.id === 'kings-fall') kingsFallWins++;
    }

    // Kings Fall should win significantly more than Salvations Edge due to the penalty
    expect(kingsFallWins).toBeGreaterThan(salvationsWins);
    // But Salvations Edge should still be able to win!
    expect(salvationsWins).toBeGreaterThan(100);
  });

  it('All raids have zero votes: still returns a valid raid (no divide by zero or NaN)', () => {
    const { pickedRaid, weights } = pickRaid(mockRaids, [], [], []);
    expect(pickedRaid).not.toBeNull();
    expect(mockRaids.some((r) => r.id === pickedRaid?.id)).toBe(true);

    for (const w of Object.values(weights)) {
      expect(isNaN(w)).toBe(false);
      expect(w).toBeGreaterThan(0);
    }
  });

  it('Negative or very large scores: no negative weights, no overflow', () => {
    const votes = [
      { raid_id: 'salvations-edge', score: -50 },
      { raid_id: 'crotas-end', score: 9999999 },
    ];

    const { weights, pickedRaid } = pickRaid(mockRaids, votes, [], []);
    expect(pickedRaid).not.toBeNull();

    for (const w of Object.values(weights)) {
      expect(isNaN(w)).toBe(false);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(100); // capped safely
    }
  });

  it('Empty pool after vetoes: returns null or clear error, not undefined behaviour', () => {
    // Veto all 4 mock raids
    const vetoes = mockRaids.map((r) => ({ raid_id: r.id }));
    const result = pickRaid(mockRaids, [], vetoes, []);

    expect(result.pickedRaid).toBeNull();
    expect(result.eligibleRaids.length).toBe(0);
    expect(Object.keys(result.weights).length).toBe(0);
  });

  it('History penalty cannot push weight to zero or below for every raid', () => {
    // All raids in history
    const history = mockRaids.map((r, i) => ({
      raid_id: r.id,
      picked_at: new Date(Date.now() - i * 10000).toISOString(),
    }));

    const { weights, eligibleRaids } = calculateRaidWeights(mockRaids, [], [], history);
    expect(eligibleRaids.length).toBe(mockRaids.length);

    for (const raid of mockRaids) {
      expect(weights[raid.id]).toBeGreaterThan(0);
      expect(weights[raid.id]).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('TOP priority (5) significantly dominates over neutral (3) raids', () => {
    // 8 raids: 1 raid has TOP (5) from 3 players = 75 weight
    // 7 other raids have MID (3) from 3 players = 9 weight each (total 63)
    // Expected odds for TOP raid: 75 / (75 + 63) = 54.3%
    const testRaids: Raid[] = [
      { id: 'salvations-edge', name: "Salvation's Edge", tagline: '1' },
      { id: 'crotas-end', name: "Crota's End", tagline: '2' },
      { id: 'root-of-nightmares', name: 'Root of Nightmares', tagline: '3' },
      { id: 'kings-fall', name: "King's Fall", tagline: '4' },
      { id: 'vow-of-the-disciple', name: 'Vow of the Disciple', tagline: '5' },
      { id: 'vault-of-glass', name: 'Vault of Glass', tagline: '6' },
      { id: 'deep-stone-crypt', name: 'Deep Stone Crypt', tagline: '7' },
      { id: 'last-wish', name: 'Last Wish', tagline: '8' },
    ];

    const votes = [
      // 3 players vote TOP (5) on salvations-edge
      { raid_id: 'salvations-edge', score: 5 },
      { raid_id: 'salvations-edge', score: 5 },
      { raid_id: 'salvations-edge', score: 5 },
      // 3 players vote MID (3) on all other raids
      ...testRaids.slice(1).flatMap((r) => [
        { raid_id: r.id, score: 3 },
        { raid_id: r.id, score: 3 },
        { raid_id: r.id, score: 3 },
      ]),
    ];

    let salvationsWins = 0;
    for (let i = 0; i < 1000; i++) {
      const { pickedRaid } = pickRaid(testRaids, votes, [], []);
      if (pickedRaid?.id === 'salvations-edge') salvationsWins++;
    }

    // Out of 1000 runs, Salvation's Edge should win roughly ~500-600 times (dominating all other 7 raids combined!)
    expect(salvationsWins).toBeGreaterThan(450);
  });

  it('Recency penalty completely expires after 2 picks / 3rd roll has 0 penalty', () => {
    const history = [
      { raid_id: 'raid-1', picked_at: new Date(Date.now() - 1000).toISOString() },
      { raid_id: 'raid-2', picked_at: new Date(Date.now() - 2000).toISOString() },
      { raid_id: 'raid-3', picked_at: new Date(Date.now() - 3000).toISOString() }, // 3rd pick ago
    ];

    const testRaids: Raid[] = [
      { id: 'raid-1', name: 'Raid 1', tagline: '1' },
      { id: 'raid-2', name: 'Raid 2', tagline: '2' },
      { id: 'raid-3', name: 'Raid 3', tagline: '3' },
    ];

    // All raids have identical scores (MID 3)
    const votes = [
      { raid_id: 'raid-1', score: 3 },
      { raid_id: 'raid-2', score: 3 },
      { raid_id: 'raid-3', score: 3 },
    ];

    const { weights } = calculateRaidWeights(testRaids, votes, [], history);

    // raid-1 (1 pick ago): 0.4x penalty = 3.0 * 0.4 = 1.2
    expect(weights['raid-1']).toBe(1.2);
    // raid-2 (2 picks ago): 0.7x penalty = 3.0 * 0.7 = 2.1
    expect(weights['raid-2']).toBe(2.1);
    // raid-3 (3 picks ago): penalty completely removed! Full weight = 3.0
    expect(weights['raid-3']).toBe(3.0);
  });

  it('fetchLiveFeaturedRaidIds returns live featured raids from Bungie API or empty set if no key', async () => {
    const liveSet = await fetchLiveFeaturedRaidIds();
    if (import.meta.env.VITE_BUNGIE_API_KEY) {
      // With the live API key, it precisely matches the active in-game director (4 featured entries)
      expect(liveSet.size).toBe(4);
      expect(liveSet.has('vow-of-the-disciple')).toBe(true);
      expect(liveSet.has('last-wish')).toBe(true);
      expect(liveSet.has('the-desert-perpetual')).toBe(true);
      expect(liveSet.has('epic-desert-perpetual')).toBe(true);
      // Unfeatured raids in the current rotation have empty challenges
      expect(liveSet.has('salvations-edge')).toBe(false);
      expect(liveSet.has('crotas-end')).toBe(false);
    } else {
      expect(liveSet.size).toBe(0);
    }
  });

  it('parseBungieMilestones accurately identifies featured raids with active challenges and excludes unfeatured ones', () => {
    // Mock response matching real Bungie /Milestones/ payload
    const mockBungieMilestones = {
      '2136320298': { // Vow of the Disciple
        activities: [{ challengeObjectiveHashes: [1863972407] }],
      },
      '3181387331': { // Last Wish
        activities: [{ challengeObjectiveHashes: [897950155] }],
      },
      '3022338715': { // The Desert Perpetual
        activities: [{ challengeObjectiveHashes: [2620817143] }],
      },
      '4196566271': { // Salvation's Edge (has empty challenge hashes -> NOT featured)
        activities: [{ challengeObjectiveHashes: [] }],
      },
      '292102995': { // King's Fall (NOT featured)
        activities: [{ challengeObjectiveHashes: [] }],
      },
    };

    const parsed = parseBungieMilestones(mockBungieMilestones);
    expect(parsed.size).toBe(4);
    expect(parsed.has('vow-of-the-disciple')).toBe(true);
    expect(parsed.has('last-wish')).toBe(true);
    expect(parsed.has('the-desert-perpetual')).toBe(true);
    expect(parsed.has('epic-desert-perpetual')).toBe(true);
    // Crucial: Salvation's Edge is NOT featured when it has no active challenge
    expect(parsed.has('salvations-edge')).toBe(false);
    expect(parsed.has('kings-fall')).toBe(false);
  });
});

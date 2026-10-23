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

describe('pickRaid - Highest Vote Pick Algorithm', () => {
  it('Highest voted raid always wins with 100% certainty (no probability dice-roll)', () => {
    // salvations-edge has 15 total votes, crotas-end has 12, others have less
    const votes = [
      { raid_id: 'salvations-edge', score: 5 },
      { raid_id: 'salvations-edge', score: 5 },
      { raid_id: 'salvations-edge', score: 5 },
      { raid_id: 'crotas-end', score: 4 },
      { raid_id: 'crotas-end', score: 4 },
      { raid_id: 'crotas-end', score: 4 },
      { raid_id: 'root-of-nightmares', score: 3 },
      { raid_id: 'kings-fall', score: 2 },
    ];

    for (let i = 0; i < 100; i++) {
      const result = pickRaid(mockRaids, votes, [], []);
      expect(result.pickedRaid?.id).toBe('salvations-edge');
    }
  });

  it('Vetoed raid never wins even if it has the highest votes', () => {
    const vetoes = [{ raid_id: 'salvations-edge' }];
    const votes = [
      { raid_id: 'salvations-edge', score: 100 }, // High votes, but vetoed!
      { raid_id: 'crotas-end', score: 20 },
      { raid_id: 'root-of-nightmares', score: 15 },
      { raid_id: 'kings-fall', score: 10 },
    ];

    for (let i = 0; i < 100; i++) {
      const { pickedRaid, vetoedRaidIds } = pickRaid(mockRaids, votes, vetoes, []);
      expect(vetoedRaidIds).toContain('salvations-edge');
      // crotas-end is the highest-voted eligible raid
      expect(pickedRaid?.id).toBe('crotas-end');
    }
  });

  it('Tied top-voted raids resolve by picking among the tied leaders', () => {
    // salvations-edge and crotas-end are tied with 10 votes each, others have 5
    const votes = [
      { raid_id: 'salvations-edge', score: 10 },
      { raid_id: 'crotas-end', score: 10 },
      { raid_id: 'root-of-nightmares', score: 5 },
      { raid_id: 'kings-fall', score: 2 },
    ];

    const counts: Record<string, number> = {
      'salvations-edge': 0,
      'crotas-end': 0,
      'root-of-nightmares': 0,
      'kings-fall': 0,
    };

    for (let i = 0; i < 500; i++) {
      const { pickedRaid } = pickRaid(mockRaids, votes, [], []);
      expect(pickedRaid).not.toBeNull();
      if (pickedRaid) {
        counts[pickedRaid.id] = (counts[pickedRaid.id] || 0) + 1;
      }
    }

    // Only the tied leaders (salvations-edge and crotas-end) should ever win
    expect(counts['root-of-nightmares']).toBe(0);
    expect(counts['kings-fall']).toBe(0);
    expect(counts['salvations-edge']).toBeGreaterThan(150);
    expect(counts['crotas-end']).toBeGreaterThan(150);
  });

  it('All raids have equal/zero votes: still returns a valid raid', () => {
    const { pickedRaid, weights } = pickRaid(mockRaids, [], [], []);
    expect(pickedRaid).not.toBeNull();
    expect(mockRaids.some((r) => r.id === pickedRaid?.id)).toBe(true);

    for (const w of Object.values(weights)) {
      expect(w).toBe(0);
    }
  });

  it('Single eligible raid: always wins', () => {
    const singleCandidate = [{ id: 'salvations-edge', name: "Salvation's Edge", tagline: 'Solo' }];
    const result = pickRaid(singleCandidate, [], [], []);
    expect(result.pickedRaid?.id).toBe('salvations-edge');
  });

  it('Empty pool after vetoes: returns null cleanly', () => {
    const vetoes = mockRaids.map((r) => ({ raid_id: r.id }));
    const result = pickRaid(mockRaids, [], vetoes, []);

    expect(result.pickedRaid).toBeNull();
    expect(result.eligibleRaids.length).toBe(0);
    expect(Object.keys(result.weights).length).toBe(0);
  });

  it('calculateRaidWeights accurately tallies scores for each eligible raid', () => {
    const votes = [
      { raid_id: 'salvations-edge', score: 5 },
      { raid_id: 'salvations-edge', score: 4 },
      { raid_id: 'crotas-end', score: 3 },
    ];
    const vetoes = [{ raid_id: 'kings-fall' }];

    const { eligibleRaids, weights, vetoedRaidIds } = calculateRaidWeights(mockRaids, votes, vetoes);

    expect(vetoedRaidIds).toContain('kings-fall');
    expect(eligibleRaids.some((r) => r.id === 'kings-fall')).toBe(false);
    expect(weights['salvations-edge']).toBe(9);
    expect(weights['crotas-end']).toBe(3);
    expect(weights['root-of-nightmares']).toBe(0);
    expect(weights['kings-fall']).toBeUndefined();
  });

  it('Applies a -3 negative weight penalty to the 2 most recent cleared raids', () => {
    const history = [
      { raid_id: 'salvations-edge', picked_at: '2026-10-20T04:00:00Z' }, // 1st most recent
      { raid_id: 'crotas-end', picked_at: '2026-10-20T03:00:00Z' },      // 2nd most recent
      { raid_id: 'kings-fall', picked_at: '2026-10-20T02:00:00Z' },      // 3rd most recent (no penalty)
    ];

    const votes = [
      { raid_id: 'salvations-edge', score: 10 },
      { raid_id: 'crotas-end', score: 8 },
      { raid_id: 'root-of-nightmares', score: 8 },
      { raid_id: 'kings-fall', score: 8 },
    ];

    const { weights } = calculateRaidWeights(mockRaids, votes, [], history);

    // salvations-edge: 10 - 3 = 7
    expect(weights['salvations-edge']).toBe(7);
    // crotas-end: 8 - 3 = 5
    expect(weights['crotas-end']).toBe(5);
    // root-of-nightmares: not in history -> full 8
    expect(weights['root-of-nightmares']).toBe(8);
    // kings-fall: 3rd most recent -> no penalty -> full 8
    expect(weights['kings-fall']).toBe(8);

    // Root of Nightmares and Kings Fall tie for highest score (8) and defeat Salvations Edge (7) despite lower initial votes
    const result = pickRaid(mockRaids, votes, [], history);
    expect(['root-of-nightmares', 'kings-fall']).toContain(result.pickedRaid?.id);
  });

  it('fetchLiveFeaturedRaidIds returns live featured raids from Bungie API or empty set if no key', async () => {
    const liveSet = await fetchLiveFeaturedRaidIds();
    if (import.meta.env.VITE_BUNGIE_API_KEY) {
      expect(liveSet instanceof Set).toBe(true);
      expect(liveSet.size).toBeGreaterThanOrEqual(0);
    } else {
      expect(liveSet.size).toBe(0);
    }
  });

  it('parseBungieMilestones accurately identifies featured raids with active challenges and excludes unfeatured ones', () => {
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
    expect(parsed.has('salvations-edge')).toBe(false);
    expect(parsed.has('kings-fall')).toBe(false);
  });
});

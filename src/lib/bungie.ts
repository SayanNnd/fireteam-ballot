import raids, { type Raid } from '../data/raids';

export interface FeaturedRaidsInfo {
  featuredRaids: Raid[];
  resetDate: string;
  source: 'bungie_api' | 'none';
}

/**
 * Official Bungie Destiny 2 milestone hashes mapped to raid IDs.
 * Bungie tracks each raid's weekly state via these milestones.
 */
export const BUNGIE_RAID_MILESTONES: Record<string, string | string[]> = {
  '3181387331': 'last-wish',
  '2712317338': 'garden-of-salvation',
  '541780856': 'deep-stone-crypt',
  '1888320892': 'vault-of-glass',
  '2136320298': 'vow-of-the-disciple',
  '292102995': 'kings-fall',
  '3699252268': 'root-of-nightmares',
  '540415767': 'crotas-end',
  '4196566271': 'salvations-edge',
  '3022338715': ['the-desert-perpetual', 'epic-desert-perpetual'],
};

// In-memory cache for live Bungie API results
let cachedFeaturedIds: Set<string> | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Pure parser function: takes a Bungie /Destiny2/Milestones/ response dictionary
 * and extracts only raids that currently have active challenge objectives.
 */
export function parseBungieMilestones(
  milestonesResponse: Record<string, { activities?: { challengeObjectiveHashes?: number[] }[] }>
): Set<string> {
  const liveFeatured = new Set<string>();

  for (const [mHash, target] of Object.entries(BUNGIE_RAID_MILESTONES)) {
    const milestone = milestonesResponse[mHash];
    if (
      milestone &&
      Array.isArray(milestone.activities) &&
      milestone.activities.some((a) => Array.isArray(a.challengeObjectiveHashes) && a.challengeObjectiveHashes.length > 0)
    ) {
      if (Array.isArray(target)) {
        target.forEach((id) => liveFeatured.add(id));
      } else {
        liveFeatured.add(target);
      }
    }
  }

  return liveFeatured;
}

/**
 * Calculates next Tuesday 17:00 UTC reset date.
 */
export function getNextWeeklyReset(): string {
  const now = new Date();
  const nextReset = new Date(now);
  const day = now.getUTCDay();
  // Tuesday is day 2
  const daysUntilTuesday = (2 - day + 7) % 7 || (now.getUTCHours() >= 17 ? 7 : 0);
  nextReset.setUTCDate(now.getUTCDate() + daysUntilTuesday);
  nextReset.setUTCHours(17, 0, 0, 0);
  return nextReset.toISOString();
}

/**
 * Fetches all active featured raids directly through the live Bungie API.
 * A raid is featured if and only if its milestone in the Bungie API has active challenge objectives
 * (e.g. Weekly Pinnacle challenge).
 *
 * If no Bungie API key is provided in .env.local (VITE_BUNGIE_API_KEY),
 * it returns an empty set so no unverified featured tags are shown.
 */
export async function fetchLiveFeaturedRaidIds(): Promise<Set<string>> {
  const apiKey = import.meta.env.VITE_BUNGIE_API_KEY;

  // Strictly require API key: if no key is configured, do not show any featured badges!
  if (!apiKey || !apiKey.trim()) {
    cachedFeaturedIds = new Set<string>();
    return cachedFeaturedIds;
  }

  // Only return cached results if we previously found featured raids or fetched recently
  if (cachedFeaturedIds && cachedFeaturedIds.size > 0 && Date.now() - lastFetchTime < CACHE_TTL_MS) {
    return cachedFeaturedIds;
  }

  const urls = [
    typeof window !== 'undefined' && window.location.port ? '/bungie-proxy/Platform/Destiny2/Milestones/' : null,
    'https://www.bungie.net/Platform/Destiny2/Milestones/',
  ].filter(Boolean) as string[];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.Response) {
          const liveFeatured = parseBungieMilestones(data.Response);
          cachedFeaturedIds = liveFeatured;
          lastFetchTime = Date.now();
          return liveFeatured;
        }
      }
    } catch (err) {
      console.warn(`Bungie API query to ${url} failed:`, err);
    }
  }

  cachedFeaturedIds = new Set<string>();
  return cachedFeaturedIds;
}

/**
 * Synchronous accessor for currently known featured raid IDs.
 * Returns an empty set if no API key is provided or not yet fetched.
 */
export function getFeaturedRaidIds(): Set<string> {
  return cachedFeaturedIds ?? new Set<string>();
}

/**
 * Full details fetcher returning active featured Raid objects.
 */
export async function fetchFeaturedRaids(): Promise<FeaturedRaidsInfo> {
  const ids = await fetchLiveFeaturedRaidIds();
  const featuredRaids = raids.filter((r) => ids.has(r.id));
  const nextReset = getNextWeeklyReset();

  return {
    featuredRaids,
    resetDate: nextReset,
    source: import.meta.env.VITE_BUNGIE_API_KEY ? 'bungie_api' : 'none',
  };
}

import raids, { type Raid } from '../data/raids';
import {
  BUNGIE_RAID_MILESTONES,
  fetchBungieRaidClearCounts,
  lookupBungieName,
  type BungieNameLookupResult,
} from './bungie-shared';

export { BUNGIE_RAID_MILESTONES } from './bungie-shared';

export interface FeaturedRaidsInfo {
  featuredRaids: Raid[];
  resetDate: string;
  source: 'bungie_api' | 'none';
}

export interface BungieRaidStatsResult {
  valid: boolean;
  displayName: string | null;
  raidClearsByRaid: Record<string, number | null> | null;
  statsAvailable?: boolean;
}

export type BungieNameVerificationResult = Pick<BungieNameLookupResult, 'valid' | 'displayName'>;

async function readBungieEndpointResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const responseText = await response.text();
  let data: unknown;

  try {
    data = JSON.parse(responseText);
  } catch {
    if (!response.ok) {
      const vercelError = response.headers.get('x-vercel-error');
      const requestId = response.headers.get('x-vercel-id');
      if (vercelError) {
        throw new Error(`Bungie lookup server failed (${vercelError}${requestId ? `, ${requestId}` : ''}). Check the Vercel function logs.`);
      }
      throw new Error(`Bungie lookup server returned HTTP ${response.status} without a JSON response.`);
    }
    throw new Error('Bungie lookup server returned an invalid response.');
  }

  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message || fallbackMessage);
  }

  return data as T;
}

const raidStatsCache = new Map<string, Promise<BungieRaidStatsResult>>();
const nameVerificationCache = new Map<string, Promise<BungieNameVerificationResult>>();

/** Check the exact Bungie Name without requiring public activity stats to be available. */
export function verifyBungieName(name: string): Promise<BungieNameVerificationResult> {
  const normalizedName = name.trim();
  const cacheKey = normalizedName.toLocaleLowerCase();
  const cached = nameVerificationCache.get(cacheKey);
  if (cached) return cached;

  const lookup = (async () => {
    if (import.meta.env.DEV) {
      const apiKey = import.meta.env.VITE_BUNGIE_API_KEY;
      if (!apiKey) throw new Error('Bungie API key is not configured.');
      const result = await lookupBungieName(normalizedName, (path, init = {}) => requestLocalBungieApi(
        path,
        apiKey,
        init,
      ));
      return { valid: result.valid, displayName: result.displayName };
    }

    const response = await fetch('/api/bungie-raid-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalizedName, verifyOnly: true }),
    });
    const data = await readBungieEndpointResponse<{ valid?: boolean; displayName?: string | null }>(
      response,
      'Bungie name lookup failed.',
    );
    return { valid: Boolean(data.valid), displayName: data.displayName ?? null };
  })();

  const request = lookup.catch((error: unknown) => {
    nameVerificationCache.delete(cacheKey);
    throw error;
  });
  nameVerificationCache.set(cacheKey, request);
  return request;
}

/** Resolve the exact Bungie Name and load its per-raid all-time clears. */
export function fetchBungieRaidStats(name: string): Promise<BungieRaidStatsResult> {
  const normalizedName = name.trim();
  const cacheKey = normalizedName.toLocaleLowerCase();
  const cached = raidStatsCache.get(cacheKey);
  if (cached) return cached;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const lookup = (async () => {
    if (import.meta.env.DEV) {
      const apiKey = import.meta.env.VITE_BUNGIE_API_KEY;
      if (!apiKey) throw new Error('Bungie API key is not configured.');
      const identity = await lookupBungieName(normalizedName, (path, init = {}) => requestLocalBungieApi(
        path,
        apiKey,
        init,
      ));
      if (!identity.valid || !identity.membership) {
        return { valid: false, displayName: null, raidClearsByRaid: null, statsAvailable: false };
      }

      try {
        const raidClearsByRaid = await fetchBungieRaidClearCounts(identity.membership, (path, init = {}) => requestLocalBungieApi(
          path,
          apiKey,
          init,
        ));
        return {
          valid: true,
          displayName: identity.displayName,
          raidClearsByRaid,
          statsAvailable: hasRaidClearCounts(raidClearsByRaid),
        };
      } catch {
        return {
          valid: true,
          displayName: identity.displayName,
          raidClearsByRaid: null,
          statsAvailable: false,
        };
      }
    }

    const response = await fetch('/api/bungie-raid-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalizedName }),
    });
    const data = await readBungieEndpointResponse<BungieRaidStatsResult>(
      response,
      'Bungie raid stats could not be loaded.',
    );
    return data;
  })();
  const timeout = new Promise<BungieRaidStatsResult>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Bungie raid stats request timed out.')), 40000);
  });
  const request = Promise.race([lookup, timeout])
    .catch((error: unknown) => {
      raidStatsCache.delete(cacheKey);
      throw error;
    })
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });

  raidStatsCache.set(cacheKey, request);
  return request;
}

async function requestBungieApi(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      'X-API-Key': apiKey,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Bungie API returned ${response.status}.`);
  return response.json();
}

async function requestLocalBungieApi(path: string, apiKey: string, init: RequestInit = {}) {
  let proxyError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestBungieApi(`/bungie-proxy/Platform${path}`, apiKey, {
        ...init,
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      proxyError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  const message = proxyError instanceof Error ? proxyError.message : 'Unknown request error.';
  throw new Error(`Bungie local proxy failed: ${message}`);
}

function hasRaidClearCounts(counts: Record<string, number | null> | null): boolean {
  return counts !== null && Object.values(counts).some((count) => typeof count === 'number');
}

// In-memory cache for live Bungie API results
let cachedFeaturedIds: Set<string> | null = null;
let lastFetchTime = 0;
let featuredApiAvailable = false;
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
 * Fetches all active featured raids through the live Bungie API.
 * A raid is featured if and only if its milestone in the Bungie API has active challenge objectives
 * (e.g. Weekly Pinnacle challenge).
 *
 * Local development uses VITE_BUNGIE_API_KEY through the Vite proxy. Production
 * calls the server endpoint so the Bungie key stays out of the browser bundle.
 */
export async function fetchLiveFeaturedRaidIds(): Promise<Set<string>> {
  const apiKey = import.meta.env.DEV ? import.meta.env.VITE_BUNGIE_API_KEY : undefined;

  // Local development calls Bungie through the Vite proxy and needs its local key.
  if (import.meta.env.DEV && (!apiKey || !apiKey.trim())) {
    featuredApiAvailable = false;
    cachedFeaturedIds = new Set<string>();
    return cachedFeaturedIds;
  }

  // Only return cached results if we previously found featured raids or fetched recently
  if (cachedFeaturedIds && cachedFeaturedIds.size > 0 && Date.now() - lastFetchTime < CACHE_TTL_MS) {
    return cachedFeaturedIds;
  }

  const urls = import.meta.env.DEV
    ? [
        '/api/bungie-milestones',
        '/bungie-proxy/Platform/Destiny2/Milestones/',
        'https://www.bungie.net/Platform/Destiny2/Milestones/',
      ]
    : ['/api/bungie-milestones'];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.Response) {
          const liveFeatured = parseBungieMilestones(data.Response);
          cachedFeaturedIds = liveFeatured;
          featuredApiAvailable = true;
          lastFetchTime = Date.now();
          return liveFeatured;
        }
      }
    } catch (err) {
      console.warn(`Bungie API query to ${url} failed:`, err);
    }
  }

  featuredApiAvailable = false;
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
    source: featuredApiAvailable ? 'bungie_api' : 'none',
  };
}

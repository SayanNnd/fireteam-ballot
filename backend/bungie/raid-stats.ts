import { env } from 'node:process';
import { fetchBungieRaidClearCounts, lookupBungieName } from '../../shared/bungie.js';
import type { ApiHandler } from '../http.js';

const BUNGIE_PLATFORM = 'https://www.bungie.net/Platform';

interface BungieRaidStatsRequest {
  name?: unknown;
  verifyOnly?: unknown;
}

function isRequestBody(value: unknown): value is BungieRaidStatsRequest {
  return typeof value === 'object' && value !== null;
}

const handler: ApiHandler = async (request, response) => {
  response.setHeader('Cache-Control', 'private, max-age=60');

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = env.BUNGIE_API_KEY;
  if (!apiKey) {
    return response.status(503).json({ error: 'Bungie API key is not configured.' });
  }

  try {
    const requestBungie = async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('X-API-Key', apiKey);
      const result = await fetch(`${BUNGIE_PLATFORM}${path}`, { ...init, headers });
      if (!result.ok) throw new Error(`Bungie API returned ${result.status}.`);
      return result.json();
    };

    const rawBody = typeof request.body === 'string' ? JSON.parse(request.body) as unknown : request.body;
    const body = isRequestBody(rawBody) ? rawBody : {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const identity = await lookupBungieName(name, requestBungie);

    if (!identity.valid || !identity.membership) {
      return response.status(200).json({
        valid: false,
        displayName: null,
        raidClearsByRaid: null,
        statsAvailable: false,
      });
    }

    if (body.verifyOnly === true) {
      return response.status(200).json({
        valid: true,
        displayName: identity.displayName,
        raidClearsByRaid: null,
        statsAvailable: false,
      });
    }

    try {
      const raidClearsByRaid = await fetchBungieRaidClearCounts(identity.membership, requestBungie);

      return response.status(200).json({
        valid: true,
        displayName: identity.displayName,
        raidClearsByRaid,
        statsAvailable: raidClearsByRaid !== null
          && Object.values(raidClearsByRaid).some((count) => typeof count === 'number'),
      });
    } catch {
      // Name verification is independent of public stats availability.
      return response.status(200).json({
        valid: true,
        displayName: identity.displayName,
        raidClearsByRaid: null,
        statsAvailable: false,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bungie API request failed.';
    console.error('[api/bungie-raid-stats] Bungie request failed:', error);
    return response.status(502).json({ error: message });
  }
};

export default handler;

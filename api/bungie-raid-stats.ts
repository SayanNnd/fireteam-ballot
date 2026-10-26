import { env } from 'node:process';
import { fetchBungieRaidClearCounts, lookupBungieName } from '../src/lib/bungie-shared.js';

const BUNGIE_PLATFORM = 'https://www.bungie.net/Platform';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, max-age=60');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = env.BUNGIE_API_KEY || env.VITE_BUNGIE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Bungie API key is not configured.' });
  }

  try {
    const requestBungie = async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('X-API-Key', apiKey);
      const response = await fetch(`${BUNGIE_PLATFORM}${path}`, { ...init, headers });
      if (!response.ok) throw new Error(`Bungie API returned ${response.status}.`);
      return response.json();
    };

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const identity = await lookupBungieName(name, requestBungie);

    if (!identity.valid || !identity.membership) {
      return res.status(200).json({
        valid: false,
        displayName: null,
        raidClearsByRaid: null,
        statsAvailable: false,
      });
    }

    if (body?.verifyOnly === true) {
      return res.status(200).json({
        valid: true,
        displayName: identity.displayName,
        raidClearsByRaid: null,
        statsAvailable: false,
      });
    }

    try {
      const raidClearsByRaid = await fetchBungieRaidClearCounts(identity.membership, requestBungie);

      return res.status(200).json({
        valid: true,
        displayName: identity.displayName,
        raidClearsByRaid,
        statsAvailable: raidClearsByRaid !== null
          && Object.values(raidClearsByRaid).some((count) => typeof count === 'number'),
      });
    } catch {
      // Name verification is independent of public stats availability.
      return res.status(200).json({
        valid: true,
        displayName: identity.displayName,
        raidClearsByRaid: null,
        statsAvailable: false,
      });
    }
  } catch (error: any) {
    console.error('[api/bungie-raid-stats] Bungie request failed:', error);
    return res.status(502).json({ error: error?.message || 'Bungie API request failed.' });
  }
}

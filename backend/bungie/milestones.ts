import { env } from 'node:process';
import type { ApiHandler } from '../http.js';

const handler: ApiHandler = async (_request, response) => {
  response.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');

  const apiKey = env.BUNGIE_API_KEY;
  if (!apiKey) {
    return response.status(200).json({ Response: {} });
  }

  try {
    const bungieResponse = await fetch('https://www.bungie.net/Platform/Destiny2/Milestones/', {
      headers: { 'X-API-Key': apiKey },
    });

    if (!bungieResponse.ok) {
      return response.status(502).json({ error: `Bungie API returned ${bungieResponse.status}.` });
    }

    return response.status(200).json(await bungieResponse.json());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bungie API request failed.';
    return response.status(502).json({ error: message });
  }
};

export default handler;

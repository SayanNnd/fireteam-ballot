export default async function handler(_req: any, res: any) {
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');

  const apiKey = process.env.VITE_BUNGIE_API_KEY || process.env.BUNGIE_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ Response: {} });
  }

  try {
    const bungieRes = await fetch('https://www.bungie.net/Platform/Destiny2/Milestones/', {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    const data = await bungieRes.json();
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

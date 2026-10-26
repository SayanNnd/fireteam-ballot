import raids from '../data/raids';

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

// Bungie's weekly milestones expose only the active variant. These manifest activity
// hashes cover the historical raid difficulties used by lifetime aggregate stats.
const BUNGIE_RAID_ACTIVITY_HASHES: Record<string, string> = {
  '2122313384': 'last-wish',
  '1661734046': 'last-wish',
  '1042180643': 'garden-of-salvation',
  '3458480158': 'garden-of-salvation',
  '2497200493': 'garden-of-salvation',
  '2659723068': 'garden-of-salvation',
  '3845997235': 'garden-of-salvation',
  '910380154': 'deep-stone-crypt',
  '3976949817': 'deep-stone-crypt',
  '3881495763': 'vault-of-glass',
  '3022541210': 'vault-of-glass',
  '3711931140': 'vault-of-glass',
  '1681562271': 'vault-of-glass',
  '2906950631': 'vow-of-the-disciple',
  '1441982566': 'vow-of-the-disciple',
  '3889634515': 'vow-of-the-disciple',
  '4156879541': 'vow-of-the-disciple',
  '4217492330': 'vow-of-the-disciple',
  '1374392663': 'kings-fall',
  '3257594522': 'kings-fall',
  '2897223272': 'kings-fall',
  '2964135793': 'kings-fall',
  '2381413764': 'root-of-nightmares',
  '2918919505': 'root-of-nightmares',
  '1566480315': 'crotas-end',
  '107319834': 'crotas-end',
  '1507509200': 'crotas-end',
  '4179289725': 'crotas-end',
  '156253568': 'crotas-end',
  '2192826039': 'salvations-edge',
  '940375169': 'salvations-edge',
  '1541433876': 'salvations-edge',
  '4129614942': 'salvations-edge',
  '1044919065': 'the-desert-perpetual',
  '3896382790': 'the-desert-perpetual',
  '3817322389': 'epic-desert-perpetual',
  '2586252122': 'epic-desert-perpetual',
};

export interface BungieMembership {
  displayName?: string;
  bungieGlobalDisplayName?: string;
  bungieGlobalDisplayNameCode?: number | string | null;
  membershipType?: number;
  membershipId?: string;
}

export interface BungieNameLookupResult {
  valid: boolean;
  displayName: string | null;
  membership: BungieMembership | null;
}

export type BungieApiRequest = (path: string, init?: RequestInit) => Promise<unknown>;

interface BungieApiEnvelope<T> {
  ErrorCode?: number;
  ErrorStatus?: string;
  Message?: string;
  Response?: T;
}

interface AggregateActivity {
  activityHash?: number;
  values?: Record<string, { basic?: { value?: number | string } }>;
}

export function splitBungieName(name: string): [string | null, number | null] {
  const separator = name.lastIndexOf('#');
  if (separator < 1) return [null, null];

  const displayName = name.slice(0, separator).trim();
  const code = name.slice(separator + 1);
  if (!displayName || displayName.length > 20 || !/^\d{4}$/.test(code)) return [null, null];
  return [displayName, Number(code)];
}

export async function lookupBungieName(name: string, request: BungieApiRequest): Promise<BungieNameLookupResult> {
  const [displayName, displayNameCode] = splitBungieName(name.trim());
  if (!displayName || displayNameCode === null) {
    return { valid: false, displayName: null, membership: null };
  }

  const response = await request('/Destiny2/SearchDestinyPlayerByBungieName/-1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, displayNameCode }),
  }) as BungieApiEnvelope<BungieMembership[]>;

  if (response.ErrorCode !== 1) {
    throw new Error(response.ErrorStatus || response.Message || 'Bungie name lookup failed.');
  }

  const membership = Array.isArray(response.Response) ? response.Response[0] ?? null : null;
  if (!membership) return { valid: false, displayName: null, membership: null };

  const canonicalDisplayName = membership.bungieGlobalDisplayName ?? membership.displayName ?? displayName;
  const canonicalCode = membership.bungieGlobalDisplayNameCode ?? displayNameCode;
  return {
    valid: true,
    displayName: `${canonicalDisplayName}#${String(canonicalCode).padStart(4, '0')}`,
    membership,
  };
}

export async function fetchBungieRaidClearCounts(
  membership: BungieMembership,
  request: BungieApiRequest,
): Promise<Record<string, number | null> | null> {
  if (!membership.membershipType || !membership.membershipId) return null;

  const profileResponse = await request(
    `/Destiny2/${membership.membershipType}/Profile/${membership.membershipId}/?components=200`,
  ) as BungieApiEnvelope<{ characters?: { data?: Record<string, unknown> } }>;

  if (profileResponse.ErrorCode !== 1) {
    throw new Error(profileResponse.ErrorStatus || profileResponse.Message || 'Bungie profile could not be loaded.');
  }

  const characterData = profileResponse.Response?.characters?.data ?? {};
  const characterIds = Object.keys(characterData).filter((characterId) => /^\d+$/.test(characterId));
  if (characterIds.length === 0) return null;

  const activityHashesByRaid = getRaidActivityHashes();
  const aggregates = await Promise.all(characterIds.map(async (characterId) => {
    const response = await request(
      `/Destiny2/${membership.membershipType}/Account/${membership.membershipId}/Character/${characterId}/Stats/AggregateActivityStats/`,
    ) as BungieApiEnvelope<{ activities?: AggregateActivity[] }>;

    if (response.ErrorCode !== 1) {
      throw new Error(response.ErrorStatus || response.Message || 'Bungie raid activity stats could not be loaded.');
    }
    return response.Response?.activities ?? [];
  }));

  const clearedByActivityHash = new Map<string, number>();
  for (const activity of aggregates.flat()) {
    if (activity.activityHash === undefined) continue;
    // AggregateActivityStats exposes completed runs as activityCompletions.
    // Keep activitiesCleared as a fallback for older response variants.
    const rawClears = activity.values?.activityCompletions?.basic?.value
      ?? activity.values?.activitiesCleared?.basic?.value;
    const parsedClears = typeof rawClears === 'number'
      ? rawClears
      : typeof rawClears === 'string'
        ? Number(rawClears)
        : NaN;
    if (Number.isFinite(parsedClears)) {
      const hash = String(activity.activityHash);
      clearedByActivityHash.set(hash, (clearedByActivityHash.get(hash) ?? 0) + Math.max(0, Math.floor(parsedClears)));
    }
  }

  return Object.fromEntries(raids.map((raid) => {
    const activityHashes = activityHashesByRaid.get(raid.id) ?? new Set<string>();
    if (activityHashes.size === 0) return [raid.id, null];
    const clears = [...activityHashes].reduce((total, hash) => total + (clearedByActivityHash.get(hash) ?? 0), 0);
    return [raid.id, clears];
  }));
}

function getRaidActivityHashes(): Map<string, Set<string>> {
  const hashesByRaid = new Map(raids.map((raid) => [raid.id, new Set<string>()] as const));
  for (const [activityHash, raidId] of Object.entries(BUNGIE_RAID_ACTIVITY_HASHES)) {
    hashesByRaid.get(raidId)?.add(activityHash);
  }
  return hashesByRaid;
}

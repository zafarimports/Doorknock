/**
 * Community groups used to colour and layer the map.
 *
 * A door's group comes from the list you upload (a column such as "Community",
 * "Group" or "Religion") or from a canvasser tapping it at the door. The app
 * never guesses a person's community from their name: name-based guessing is
 * wrong often enough that a canvasser would be knocking with bad information,
 * and an unclassified door is more useful than a mislabelled one.
 */
export type CommunityId = 'muslim' | 'sikh' | 'hindu' | 'minority' | 'general' | 'unknown';

export interface CommunityMeta {
  id: CommunityId;
  label: string;
  color: string;
}

export const COMMUNITIES: CommunityMeta[] = [
  { id: 'muslim', label: 'Muslim', color: '#10b981' },
  { id: 'sikh', label: 'Punjabi / Sikh', color: '#f59e0b' },
  { id: 'hindu', label: 'Hindu', color: '#fb7185' },
  { id: 'minority', label: 'Other minority', color: '#a855f7' },
  { id: 'general', label: 'Everyone else', color: '#38bdf8' },
  { id: 'unknown', label: 'Not classified', color: '#64748b' },
];

export const COMMUNITY_MAP: Record<CommunityId, CommunityMeta> = Object.fromEntries(
  COMMUNITIES.map((c) => [c.id, c]),
) as Record<CommunityId, CommunityMeta>;

/** Where a door's group came from, so the app can show it and you can trust it. */
export type CommunitySource = 'file' | 'manual';

/** Maps whatever your spreadsheet calls a group onto one of ours. */
export function normalizeCommunity(raw: string): CommunityId | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (/muslim|islam|moslem/.test(s)) return 'muslim';
  if (/sikh|punjab|khalsa/.test(s)) return 'sikh';
  if (/hindu/.test(s)) return 'hindu';
  if (/minorit|ethnic|newcomer|immigrant/.test(s)) return 'minority';
  if (/general|everyone else|\belse\b|rest|majority|none|n\/a/.test(s)) return 'general';
  return undefined;
}

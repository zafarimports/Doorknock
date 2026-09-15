/**
 * Community groups used to colour, layer and filter the map.
 *
 * A door's group comes from the list you upload (a column such as "Community",
 * "Group" or "Religion"), from tagging a whole file as one group while importing
 * it, or from a canvasser tapping it at the door. The app never guesses a
 * person's community from their name: name guessing is wrong often enough that a
 * canvasser would knock with bad information, and an unclassified door is more
 * useful than a mislabelled one.
 *
 * The preset groups below are a starting point, not a fixed list — a campaign can
 * add its own (see `state/store.ts`, `addCommunity`), because no six labels fit
 * every ward.
 */
export type CommunityId = string;

export interface CommunityMeta {
  id: CommunityId;
  label: string;
  color: string;
}

export const UNCLASSIFIED: CommunityId = 'unknown';

export const PRESET_COMMUNITIES: CommunityMeta[] = [
  { id: 'muslim', label: 'Muslim', color: '#10b981' },
  { id: 'sikh', label: 'Punjabi / Sikh', color: '#f59e0b' },
  { id: 'hindu', label: 'Hindu', color: '#fb7185' },
  { id: 'black', label: 'Black', color: '#8b5cf6' },
  { id: 'minority', label: 'Other minority', color: '#06b6d4' },
  { id: 'general', label: 'Everyone else', color: '#3b82f6' },
  { id: UNCLASSIFIED, label: 'Not classified', color: '#64748b' },
];

/** Colours handed to groups a campaign adds itself. */
export const EXTRA_COLORS = ['#ec4899', '#84cc16', '#eab308', '#14b8a6', '#f43f5e', '#a3e635', '#c084fc'];

export function communityMeta(groups: CommunityMeta[], id: CommunityId): CommunityMeta {
  return (
    groups.find((c) => c.id === id) ??
    PRESET_COMMUNITIES.find((c) => c.id === id) ?? { id, label: id, color: '#64748b' }
  );
}

/** Where a door's group came from, so the app can show it and you can trust it. */
export type CommunitySource = 'file' | 'manual';

/** Maps whatever your spreadsheet calls a group onto one of the presets. */
export function normalizeCommunity(raw: string): CommunityId | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (/muslim|islam|moslem/.test(s)) return 'muslim';
  if (/sikh|punjab|khalsa/.test(s)) return 'sikh';
  if (/hindu/.test(s)) return 'hindu';
  if (/black|african|caribbean/.test(s)) return 'black';
  if (/minorit|ethnic|newcomer|immigrant/.test(s)) return 'minority';
  if (/general|everyone else|\belse\b|rest|majority|none|n\/a/.test(s)) return 'general';
  return undefined;
}

/** A label a campaign typed becomes a stable id. */
export function idForLabel(label: string): CommunityId {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `group-${Math.random().toString(36).slice(2, 7)}`;
}

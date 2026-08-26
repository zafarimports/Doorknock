export type DoorStatus =
  | 'not_started'
  | 'strong_support'
  | 'support'
  | 'undecided'
  | 'oppose'
  | 'not_home'
  | 'come_back'
  | 'refused'
  | 'moved'
  | 'do_not_contact';

export interface StatusMeta {
  id: DoorStatus;
  label: string;
  short: string;
  color: string;
  /** counts as "door knocked" (i.e. the door was actually visited) */
  knocked: boolean;
}

export const STATUSES: StatusMeta[] = [
  { id: 'not_started', label: 'Not knocked', short: 'New', color: '#64748b', knocked: false },
  { id: 'strong_support', label: 'Strong support', short: '1', color: '#15803d', knocked: true },
  { id: 'support', label: 'Leaning support', short: '2', color: '#4ade80', knocked: true },
  { id: 'undecided', label: 'Undecided', short: '3', color: '#facc15', knocked: true },
  { id: 'oppose', label: 'Opposed', short: '4', color: '#ef4444', knocked: true },
  { id: 'not_home', label: 'Not home', short: 'NH', color: '#38bdf8', knocked: true },
  { id: 'come_back', label: 'Come back later', short: 'CB', color: '#a855f7', knocked: true },
  { id: 'refused', label: 'Refused', short: 'RF', color: '#9f1239', knocked: true },
  { id: 'moved', label: 'Moved / bad address', short: 'MV', color: '#b45309', knocked: true },
  { id: 'do_not_contact', label: 'Do not contact', short: 'DNC', color: '#111827', knocked: true },
];

export const STATUS_MAP: Record<DoorStatus, StatusMeta> = Object.fromEntries(
  STATUSES.map((s) => [s.id, s]),
) as Record<DoorStatus, StatusMeta>;

export type GeocodeStatus = 'pending' | 'ok' | 'failed' | 'manual' | 'skipped';

export interface Person {
  id: string;
  householdId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  /** Owner / Tenant / Spouse / Boarder etc. */
  occupancy?: string;
  phone?: string;
  email?: string;
  /** per-person disposition; falls back to the household status */
  status?: DoorStatus;
  /** every column of the original row, verbatim */
  raw: Record<string, string>;
}

export interface Note {
  id: string;
  at: number;
  author?: string;
  text: string;
}

export interface Household {
  id: string;
  address: string;
  unit?: string;
  city?: string;
  postal?: string;
  region?: string;
  poll?: string;
  lat?: number;
  lng?: number;
  geocode: GeocodeStatus;
  geocodeLabel?: string;
  geocodePrecision?: string;
  status: DoorStatus;
  knockedAt?: number;
  knockedBy?: string;
  visits: number;
  notes: Note[];
  tags: string[];
  turfId?: string;
  updatedAt: number;
  /** sort key: house number for walk-list ordering */
  houseNumber?: number;
  street?: string;
}

export interface Turf {
  id: string;
  name: string;
  color: string;
  /** [lat, lng] ring */
  polygon: [number, number][];
  canvasserId?: string;
  createdAt: number;
}

export interface Canvasser {
  id: string;
  name: string;
  color: string;
  code: string;
}

export interface ColumnMapping {
  name?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  unit?: string;
  city?: string;
  postal?: string;
  region?: string;
  poll?: string;
  occupancy?: string;
  phone?: string;
  email?: string;
  lat?: string;
  lng?: string;
}

export interface Settings {
  /** appended to Nominatim requests so OSM can contact you about heavy use */
  contactEmail: string;
  defaultCountry: string;
  geocoder: 'nominatim' | 'mapbox';
  mapboxToken: string;
  /** who is knocking right now — stamped onto notes and knocks */
  activeCanvasserId?: string;
  groupHouseholds: boolean;
}

export interface ProjectFile {
  version: 1;
  exportedAt: number;
  households: Household[];
  people: Person[];
  turfs: Turf[];
  canvassers: Canvasser[];
  settings: Settings;
  sourceColumns: string[];
}

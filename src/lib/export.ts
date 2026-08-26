import type { Canvasser, Household, Person, ProjectFile, Turf } from '../types';
import { STATUS_MAP } from '../types';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportResults(
  households: Household[],
  people: Person[],
  turfs: Turf[],
  canvassers: Canvasser[],
  sourceColumns: string[],
): Promise<void> {
  const XLSX = await import('xlsx');
  const byId = new Map(households.map((h) => [h.id, h]));
  const turfById = new Map(turfs.map((t) => [t.id, t]));
  const canvasserById = new Map(canvassers.map((c) => [c.id, c]));

  const rows = people.map((p) => {
    const h = byId.get(p.householdId);
    const status = p.status ?? h?.status ?? 'not_started';
    const turf = h?.turfId ? turfById.get(h.turfId) : undefined;
    const assigned = turf?.canvasserId ? canvasserById.get(turf.canvasserId) : undefined;
    const base: Record<string, string | number> = {};
    sourceColumns.forEach((c) => {
      base[c] = p.raw[c] ?? '';
    });
    return {
      ...base,
      'Door status': STATUS_MAP[status].label,
      Knocked: h && STATUS_MAP[h.status].knocked ? 'Yes' : 'No',
      'Knocked at': h?.knockedAt ? new Date(h.knockedAt).toLocaleString() : '',
      Visits: h?.visits ?? 0,
      Notes: (h?.notes ?? []).map((n) => `[${new Date(n.at).toLocaleString()}] ${n.text}`).join(' | '),
      Tags: (h?.tags ?? []).join(', '),
      Turf: turf?.name ?? '',
      Canvasser: assigned?.name ?? '',
      Latitude: h?.lat ?? '',
      Longitude: h?.lng ?? '',
      'Geocode status': h?.geocode ?? '',
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Canvass results');

  const summary = households.map((h) => ({
    Address: h.address,
    Unit: h.unit ?? '',
    City: h.city ?? '',
    Postal: h.postal ?? '',
    Poll: h.poll ?? '',
    Residents: people.filter((p) => p.householdId === h.id).length,
    Status: STATUS_MAP[h.status].label,
    Visits: h.visits,
    Notes: h.notes.length,
    Turf: h.turfId ? turfById.get(h.turfId)?.name ?? '' : '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Doors');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(new Blob([out], { type: 'application/octet-stream' }), `doorknock-results-${stamp()}.xlsx`);
}

export function exportProject(project: ProjectFile): void {
  download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `doorknock-project-${stamp()}.json`);
}

export async function readProjectFile(file: File): Promise<ProjectFile> {
  const text = await file.text();
  const parsed = JSON.parse(text) as ProjectFile;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.households)) {
    throw new Error('That does not look like a Doorknock project file.');
  }
  return parsed;
}

import { useMemo, useRef, useState } from 'react';
import type { ColumnMapping } from '../types';
import { guessMapping } from '../lib/normalize';
import { readWorkbook, type SheetPreview } from '../lib/parse';
import { readProjectFile } from '../lib/export';
import { useStore } from '../state/store';
import { UNCLASSIFIED, type CommunityId } from '../lib/communities';
import { STATUS_MAP } from '../types';

const FIELDS: { key: keyof ColumnMapping; label: string; hint?: string; required?: boolean }[] = [
  { key: 'name', label: 'Full name', hint: 'e.g. "AYUB, SAMIA"' },
  { key: 'firstName', label: 'First name', hint: 'only if the sheet splits names' },
  { key: 'lastName', label: 'Last name', hint: 'only if the sheet splits names' },
  { key: 'address', label: 'Street address', hint: 'or just the street name, with the number below', required: true },
  { key: 'streetNumber', label: 'Street number', hint: 'only if the sheet keeps it apart' },
  { key: 'streetSuffix', label: 'Number suffix', hint: 'the A in 50A' },
  { key: 'unit', label: 'Unit / apt' },
  { key: 'city', label: 'City' },
  { key: 'postal', label: 'Postal / ZIP' },
  { key: 'region', label: 'Province / state' },
  { key: 'poll', label: 'Poll / ward' },
  { key: 'occupancy', label: 'Occupancy', hint: 'Owner, Tenant, Spouse…' },
  { key: 'community', label: 'Community / group', hint: 'Muslim, Sikh, Hindu… colours the map' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'lat', label: 'Latitude', hint: 'skips geocoding when present' },
  { key: 'lng', label: 'Longitude' },
];

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export default function ImportWizard({ onClose, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<SheetPreview[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [busy, setBusy] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const hasData = useStore((s) => s.households.length > 0);
  const groupHouseholds = useStore((s) => s.settings.groupHouseholds);
  // never the default when there is work on the map to lose
  const [mode, setMode] = useState<'replace' | 'append' | 'merge'>('merge');
  const [community, setCommunity] = useState<CommunityId | ''>('');
  const defaultCity = useStore((s) => s.settings.defaultCity);
  const groups = useStore((s) => s.communities);

  const sheet = sheets[sheetIdx];
  const preview = useMemo(() => sheet?.rows.slice(0, 6) ?? [], [sheet]);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(undefined);
    setBusy(true);
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const project = await readProjectFile(file);
        useStore.getState().loadProject(project);
        useStore.getState().notify(`Loaded project with ${project.households.length} doors`);
        onImported();
        return;
      }
      const parsed = await readWorkbook(file);
      const withRows = parsed.filter((s) => s.rows.length > 0);
      if (!withRows.length) throw new Error('No rows found in that file.');
      setSheets(withRows);
      setSheetIdx(0);
      setMapping(guessMapping(withRows[0].headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const chooseSheet = (idx: number) => {
    setSheetIdx(idx);
    setMapping(guessMapping(sheets[idx].headers));
  };

  const doImport = () => {
    if (!sheet || !mapping.address) return;
    const replacing = !hasData || mode === 'replace';
    if (replacing && hasData) {
      const state = useStore.getState();
      const knocked = state.households.filter((h) => STATUS_MAP[h.status].knocked).length;
      const notes = state.households.reduce((n, h) => n + h.notes.length, 0);
      const loss = [
        `${state.households.length} doors`,
        knocked ? `${knocked} knocked` : '',
        notes ? `${notes} notes` : '',
        state.turfs.length ? `${state.turfs.length} turf` : '',
      ]
        .filter(Boolean)
        .join(', ');
      if (!confirm(`Replace everything on the map?\n\nThis deletes ${loss}. It cannot be undone.`)) return;
    }
    const { added, tagged, skipped } = useStore.getState().importRows(sheet.rows, mapping, sheet.headers, {
      mode: replacing ? 'replace' : mode,
      community: community || undefined,
    });
    const parts = [
      tagged ? `Tagged ${tagged} door${tagged === 1 ? '' : 's'}` : '',
      added ? `${tagged ? 'added' : 'Added'} ${added} new door${added === 1 ? '' : 's'}` : '',
      skipped ? `${skipped} row${skipped === 1 ? '' : 's'} had no address` : '',
    ].filter(Boolean);
    useStore.getState().notify(parts.join(' · ') || 'Nothing to import');
    onImported();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Import your list</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {!sheet && (
          <div
            className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
          >
            <div className="dropzone__icon">⬆</div>
            <p>
              <strong>Choose a file</strong> from your phone or computer
            </p>
            <p className="muted">
              .xlsx, .xls or .csv with names and street addresses. A Community column colours the map.
            </p>
            {busy && <p className="muted">Reading file…</p>}
            {error && <p className="error">{error}</p>}
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              hidden
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>
        )}

        {sheet && (
          <div className="wizard">
            {sheets.length > 1 && (
              <label className="field">
                <span>Sheet</span>
                <select value={sheetIdx} onChange={(e) => chooseSheet(Number(e.target.value))}>
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name} ({s.rows.length} rows)
                    </option>
                  ))}
                </select>
              </label>
            )}

            <p className="muted">
              Found <strong>{sheet.rows.length}</strong> rows and {sheet.headers.length} columns. Check the
              matches below — we guessed them from your headers.
            </p>

            <div className="match-summary">
              <strong>
                Matched {Object.values(mapping).filter(Boolean).length} column
                {Object.values(mapping).filter(Boolean).length === 1 ? '' : 's'}
              </strong>
              <span className="muted small">
                Address → {mapping.address ?? 'not set'} · Name → {mapping.name ?? mapping.firstName ?? 'not set'} ·
                Community → {mapping.community ?? 'not in sheet'}
              </span>
              <button className="btn btn--ghost" onClick={() => setShowMatches((v) => !v)}>
                {showMatches ? 'Hide matches' : 'Change matches'}
              </button>
            </div>

            <div className="mapping-grid" hidden={!showMatches}>
              {FIELDS.map((f) => (
                <label key={f.key} className={`field ${f.required && !mapping[f.key] ? 'field--warn' : ''}`}>
                  <span>
                    {f.label}
                    {f.required && <em> *</em>}
                  </span>
                  <select
                    value={mapping[f.key] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                  >
                    <option value="">— not in sheet —</option>
                    {sheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {f.hint && <small className="muted">{f.hint}</small>}
                </label>
              ))}
            </div>

            <div className="wizard__options">
              <label className="field">
                <span>Everyone in this file is</span>
                <select
                  value={community}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      const label = prompt('Name the group (Black, Portuguese, Tamil…)');
                      if (!label?.trim()) return;
                      setCommunity(useStore.getState().addCommunity(label).id);
                      return;
                    }
                    setCommunity(e.target.value as CommunityId | '');
                  }}
                >
                  <option value="">— use the sheet's own column, if it has one —</option>
                  {groups
                    .filter((c) => c.id !== UNCLASSIFIED)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  <option value="__new__">+ New group…</option>
                </select>
                <small className="muted">
                  Pick a group to tag a single-community list — a Muslim list, a Punjabi list — as you load it.
                </small>
              </label>

              {!mapping.city && (
                <label className="field">
                  <span>City or town these addresses are in</span>
                  <input
                    defaultValue={defaultCity}
                    placeholder="e.g. Cambridge"
                    onChange={(e) => useStore.getState().updateSettings({ defaultCity: e.target.value })}
                  />
                  <small className="muted">This sheet has no city column, and addresses need one to be found.</small>
                </label>
              )}

              {hasData && (
                <label className="field">
                  <span>These doors should</span>
                  <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                    <option value="merge">Tag the doors already on the map (add any that are new)</option>
                    <option value="append">Add as extra doors, even if the address repeats</option>
                    <option value="replace">Replace everything on the map</option>
                  </select>
                </label>
              )}

              <label className="check">
                <input
                  type="checkbox"
                  checked={groupHouseholds}
                  onChange={(e) => useStore.getState().updateSettings({ groupHouseholds: e.target.checked })}
                />
                Group people at the same address into one door
              </label>
            </div>

            <div className="preview">
              <table>
                <thead>
                  <tr>
                    {sheet.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {sheet.headers.map((h) => (
                        <td key={h}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="modal__foot">
              <button className="btn btn--ghost" onClick={() => setSheets([])}>
                Choose another file
              </button>
              <button className="btn btn--primary" disabled={!mapping.address} onClick={doImport}>
                Import {sheet.rows.length} rows
              </button>
            </footer>
            {!mapping.address && <p className="error">Pick the column that holds the street address to continue.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

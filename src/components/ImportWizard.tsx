import { useMemo, useRef, useState } from 'react';
import type { ColumnMapping } from '../types';
import { guessMapping } from '../lib/normalize';
import { readWorkbook, type SheetPreview } from '../lib/parse';
import { readProjectFile } from '../lib/export';
import { useStore } from '../state/store';

const FIELDS: { key: keyof ColumnMapping; label: string; hint?: string; required?: boolean }[] = [
  { key: 'name', label: 'Full name', hint: 'e.g. "AYUB, SAMIA"' },
  { key: 'firstName', label: 'First name', hint: 'only if the sheet splits names' },
  { key: 'lastName', label: 'Last name', hint: 'only if the sheet splits names' },
  { key: 'address', label: 'Street address', required: true },
  { key: 'unit', label: 'Unit / apt' },
  { key: 'city', label: 'City' },
  { key: 'postal', label: 'Postal / ZIP' },
  { key: 'region', label: 'Province / state' },
  { key: 'poll', label: 'Poll / ward' },
  { key: 'occupancy', label: 'Occupancy', hint: 'Owner, Tenant, Spouse…' },
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
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const hasData = useStore((s) => s.households.length > 0);
  const groupHouseholds = useStore((s) => s.settings.groupHouseholds);
  const [replace, setReplace] = useState(true);

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
    const { added, skipped } = useStore
      .getState()
      .importRows(sheet.rows, mapping, sheet.headers, { replace: replace || !hasData });
    useStore
      .getState()
      .notify(
        `Imported ${added} door${added === 1 ? '' : 's'} from ${sheet.rows.length} rows` +
          (skipped ? ` — ${skipped} row${skipped === 1 ? '' : 's'} had no address` : ''),
      );
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
              <strong>Drop a spreadsheet here</strong> or click to browse
            </p>
            <p className="muted">
              .xlsx, .xls or .csv with names and street addresses — or a Doorknock project .json
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

            <div className="mapping-grid">
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
              <label className="check">
                <input
                  type="checkbox"
                  checked={groupHouseholds}
                  onChange={(e) => useStore.getState().updateSettings({ groupHouseholds: e.target.checked })}
                />
                Group people at the same address into one door
              </label>
              {hasData && (
                <label className="check">
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                  Replace the {useStore.getState().households.length} doors already loaded
                </label>
              )}
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

import { useMemo } from 'react';
import { useStore } from '../state/store';
import { useGeocoder } from '../state/useGeocoder';
import { exportProject, exportResults } from '../lib/export';
import { clearState } from '../lib/storage';

interface Props {
  onOpenImport: () => void;
}

export default function DataTab({ onOpenImport }: Props) {
  const households = useStore((s) => s.households);
  const people = useStore((s) => s.people);
  const turfs = useStore((s) => s.turfs);
  const canvassers = useStore((s) => s.canvassers);
  const settings = useStore((s) => s.settings);
  const sourceColumns = useStore((s) => s.sourceColumns);
  const { start, stop, running, progress, errors } = useGeocoder();

  const counts = useMemo(() => {
    let pending = 0;
    let failed = 0;
    let located = 0;
    households.forEach((h) => {
      if (h.geocode === 'pending') pending++;
      else if (h.geocode === 'failed') failed++;
      else if (h.lat !== undefined) located++;
    });
    return { pending, failed, located };
  }, [households]);

  const failedList = households.filter((h) => h.geocode === 'failed').slice(0, 25);

  return (
    <div className="pane">
      <section className="pane__section">
        <h3>Import</h3>
        <button className="btn btn--primary btn--block" onClick={onOpenImport}>
          Upload spreadsheet
        </button>
        <p className="muted small">
          {households.length} doors · {people.length} people · {sourceColumns.length} source columns
        </p>
      </section>

      <section className="pane__section">
        <h3>Put them on the map</h3>
        <p className="muted small">
          {counts.located} located · {counts.pending} waiting · {counts.failed} not found
        </p>
        {progress && (
          <>
            <div className="progress">
              <div
                className="progress__bar"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="muted small">
              {progress.done}/{progress.total} · {progress.ok} found · {progress.failed} missed
              {progress.current && running ? ` · ${progress.current}` : ''}
            </p>
          </>
        )}
        <div className="btn-row">
          {running ? (
            <button className="btn btn--ghost" onClick={stop}>
              Pause
            </button>
          ) : (
            <button className="btn btn--primary" disabled={!counts.pending} onClick={() => void start()}>
              Geocode {counts.pending} addresses
            </button>
          )}
          {!running && counts.failed > 0 && (
            <button className="btn btn--ghost" onClick={() => void start({ retryFailed: true })}>
              Retry {counts.failed} failures
            </button>
          )}
        </div>
        {settings.geocoder === 'nominatim' && (
          <p className="muted small">
            Using OpenStreetMap's free geocoder — about one address per second, so a 1,000-row list takes
            roughly 20 minutes. Results are cached, so re-importing the same list is instant.
          </p>
        )}
        {failedList.length > 0 && (
          <details className="details">
            <summary>{counts.failed} addresses need a hand</summary>
            <ul className="mini-list">
              {failedList.map((h) => (
                <li key={h.id}>
                  <button className="link-btn" onClick={() => useStore.getState().select(h.id)}>
                    {h.address}
                    {h.city ? `, ${h.city}` : ''}
                  </button>
                </li>
              ))}
            </ul>
            <p className="muted small">Open one and use “Place on map” to drop its pin by hand.</p>
          </details>
        )}
        {errors.length > 0 && (
          <details className="details">
            <summary>{errors.length} geocoder errors</summary>
            <ul className="mini-list">
              {errors.slice(0, 10).map((e, i) => (
                <li key={i} className="muted small">
                  {e}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="pane__section">
        <h3>Export</h3>
        <div className="btn-row">
          <button
            className="btn btn--ghost"
            disabled={!households.length}
            onClick={() => void exportResults(households, people, turfs, canvassers, sourceColumns)}
          >
            Results as .xlsx
          </button>
          <button
            className="btn btn--ghost"
            disabled={!households.length}
            onClick={() =>
              exportProject({
                version: 1,
                exportedAt: Date.now(),
                households,
                people,
                turfs,
                canvassers,
                settings,
                sourceColumns,
              })
            }
          >
            Project file
          </button>
        </div>
        <p className="muted small">
          The spreadsheet keeps every original column and adds status, notes, tags, turf and coordinates. The
          project file carries the whole workspace to another device — load it from the upload screen.
        </p>
      </section>

      <section className="pane__section">
        <h3>Settings</h3>
        <label className="field">
          <span>Geocoder</span>
          <select
            value={settings.geocoder}
            onChange={(e) => useStore.getState().updateSettings({ geocoder: e.target.value as 'nominatim' | 'mapbox' })}
          >
            <option value="nominatim">OpenStreetMap Nominatim (free, slow)</option>
            <option value="mapbox">Mapbox (fast, needs a token)</option>
          </select>
        </label>
        {settings.geocoder === 'mapbox' && (
          <label className="field">
            <span>Mapbox token</span>
            <input
              value={settings.mapboxToken}
              onChange={(e) => useStore.getState().updateSettings({ mapboxToken: e.target.value })}
              placeholder="pk.…"
            />
          </label>
        )}
        <label className="field">
          <span>Country</span>
          <input
            value={settings.defaultCountry}
            onChange={(e) => useStore.getState().updateSettings({ defaultCountry: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Contact email</span>
          <input
            value={settings.contactEmail}
            onChange={(e) => useStore.getState().updateSettings({ contactEmail: e.target.value })}
            placeholder="you@example.com"
          />
          <small className="muted">Sent with OpenStreetMap requests so they can reach you about heavy use.</small>
        </label>
      </section>

      <section className="pane__section">
        <h3>Danger zone</h3>
        <button
          className="btn btn--danger"
          onClick={() => {
            if (!confirm('Delete every door, note and turf in this workspace?')) return;
            useStore.getState().clearAll();
            void clearState();
          }}
        >
          Clear workspace
        </button>
      </section>
    </div>
  );
}

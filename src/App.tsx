import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView';
import MenuPanel, { type MenuSection } from './components/MenuPanel';
import LayersPanel from './components/LayersPanel';
import GroupBar from './components/GroupBar';
import HouseholdPanel from './components/HouseholdPanel';
import ImportWizard from './components/ImportWizard';
import { useStore } from './state/store';
import { useVisibleHouseholds } from './state/useVisible';
import { loadState, requestPersistence, saveState } from './lib/storage';
import { getDemo } from './lib/demo';
import { loadPreloadedProject } from './lib/preload';
import { readWorkbook } from './lib/parse';
import { guessMapping } from './lib/normalize';
import { STATUS_MAP } from './types';
import { useGeocoder } from './state/useGeocoder';

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const households = useStore((s) => s.households);
  const selectedId = useStore((s) => s.selectedHouseholdId);
  const toast = useStore((s) => s.toast);
  const visible = useVisibleHouseholds();

  const [showImport, setShowImport] = useState(false);
  const [menu, setMenu] = useState<MenuSection>();
  const [layersOpen, setLayersOpen] = useState(false);
  const saveTimer = useRef<number>();
  const { start: startGeocoding, running: geocoding, progress: geocodeProgress } = useGeocoder();
  const [offline, setOffline] = useState(!navigator.onLine);
  const followMe = useStore((s) => s.settings.followMe);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const progress = useMemo(() => {
    const knocked = visible.filter((h) => STATUS_MAP[h.status].knocked).length;
    return { knocked, total: visible.length, pct: visible.length ? Math.round((knocked / visible.length) * 100) : 0 };
  }, [visible]);

  // restore the workspace from IndexedDB on first paint
  useEffect(() => {
    void requestPersistence();
    void loadState().then(async (state) => {
      useStore.getState().hydrate(
        state ?? {
          households: [],
          people: [],
          turfs: [],
          canvassers: [],
          settings: useStore.getState().settings,
          sourceColumns: [],
        },
      );
      if (useStore.getState().households.length) return;

      // a build can ship its own list — the ward already imported, tagged and
      // placed — so a canvasser opens the app on a map, not on a file picker
      const loaded = await loadPreloadedProject();
      if (loaded) return;

      // a demo build ships a starter list so the map is never empty on arrival
      const demo = getDemo();
      if (demo?.csv) {
        const sheets = await readWorkbook(new File([demo.csv], 'demo.csv', { type: 'text/csv' }));
        const sheet = sheets[0];
        if (sheet?.rows.length) {
          useStore.getState().importRows(sheet.rows, guessMapping(sheet.headers), sheet.headers, { mode: 'replace' });
          if (demo.note) useStore.getState().notify(demo.note);
        }
      }
    });
  }, []);

  // …and write it back, debounced, whenever anything changes
  useEffect(() => {
    if (!hydrated) return;
    const snapshot = () => {
      const s = useStore.getState();
      return {
        households: s.households,
        people: s.people,
        turfs: s.turfs,
        canvassers: s.canvassers,
        settings: s.settings,
        sourceColumns: s.sourceColumns,
      };
    };
    let dirtySince = 0;
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      dirtySince = 0;
      void saveState(snapshot());
    };
    // canvassers lock the phone seconds after a knock — never lose that write
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);

    let previous = snapshot();
    const unsubscribe = useStore.subscribe(() => {
      const next = snapshot();
      // geocode progress and toasts churn several times a second; only real data
      // changes deserve a write, and a long run must not defer one indefinitely
      const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => next[k] !== previous[k]);
      previous = next;
      if (!changed) return;
      const now = Date.now();
      if (!dirtySince) dirtySince = now;
      if (now - dirtySince > 5000) {
        flush();
        return;
      }
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flush, 400);
    });
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      unsubscribe();
    };
  }, [hydrated]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => useStore.getState().dismissToast(), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // opening a door should get the panels out of the way
  useEffect(() => {
    if (selectedId) {
      setMenu(undefined);
      setLayersOpen(false);
    }
  }, [selectedId]);

  const empty = hydrated && households.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <button className="topbar__btn" onClick={() => setMenu(menu ? undefined : 'doors')} aria-label="Menu">
          ☰
        </button>
        <div className="topbar__progress" onClick={() => setMenu('doors')} role="button" tabIndex={0}>
          <strong>
            {progress.knocked}
            <span className="muted">/{progress.total}</span>
          </strong>
          <span className="topbar__bar">
            <span style={{ width: `${progress.pct}%` }} />
          </span>
          <span className="muted small">knocked</span>
        </div>
        <button
          className={`topbar__btn ${followMe ? 'topbar__btn--on' : ''}`}
          onClick={() => useStore.getState().requestRecenter()}
          aria-label="Show where I am"
          title="Show where I am"
        >
          ◎
        </button>
        <button
          className={`topbar__btn topbar__btn--wide ${layersOpen ? 'topbar__btn--on' : ''}`}
          onClick={() => setLayersOpen((v) => !v)}
          aria-label="Layers"
          title="Groups and layers"
        >
          Groups
        </button>
      </header>

      {offline && (
        <div className="banner">
          No signal — the map and address lookups need one. Knocking and notes still work.
        </div>
      )}

      {geocoding && geocodeProgress && (
        <div className="working" onClick={() => setMenu('data')}>
          <span className="working__spin" />
          Putting addresses on the map — {geocodeProgress.done} of {geocodeProgress.total}
          {geocodeProgress.failed > 0 && ` · ${geocodeProgress.failed} not found`}
        </div>
      )}

      <main className="workspace">
        <div className="map-area">
          <MapView />
          <GroupBar />
          {empty && (
            <div className="empty">
              <div className="empty__card">
                <h1>Load your list</h1>
                <p>
                  A spreadsheet with names and street addresses becomes a map of doors you can knock, colour by
                  community and take notes on.
                </p>
                <button className="btn btn--primary btn--lg" onClick={() => setShowImport(true)}>
                  Upload spreadsheet
                </button>
              </div>
            </div>
          )}
        </div>

        {menu && <MenuPanel initial={menu} onClose={() => setMenu(undefined)} onOpenImport={() => setShowImport(true)} />}
        {layersOpen && <LayersPanel onClose={() => setLayersOpen(false)} />}
        <HouseholdPanel />
      </main>

      {showImport && (
        <ImportWizard
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            // finding the addresses is our job, not something to ask about
            if (useStore.getState().households.some((h) => h.geocode === 'pending')) void startGeocoding();
          }}
        />
      )}

      {toast && (
        <div
          className={`toast ${toast.kind === 'error' ? 'toast--error' : ''}`}
          onClick={() => useStore.getState().dismissToast()}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

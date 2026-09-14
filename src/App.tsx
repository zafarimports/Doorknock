import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView';
import MenuPanel, { type MenuSection } from './components/MenuPanel';
import LayersPanel from './components/LayersPanel';
import HouseholdPanel from './components/HouseholdPanel';
import ImportWizard from './components/ImportWizard';
import { selectVisible, useStore } from './state/store';
import { loadState, saveState } from './lib/storage';
import { getDemo } from './lib/demo';
import { readWorkbook } from './lib/parse';
import { guessMapping } from './lib/normalize';
import { STATUS_MAP } from './types';

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const households = useStore((s) => s.households);
  const selectedId = useStore((s) => s.selectedHouseholdId);
  const toast = useStore((s) => s.toast);
  const visible = useStore(selectVisible);

  const [showImport, setShowImport] = useState(false);
  const [menu, setMenu] = useState<MenuSection>();
  const [layersOpen, setLayersOpen] = useState(false);
  const saveTimer = useRef<number>();

  const progress = useMemo(() => {
    const knocked = visible.filter((h) => STATUS_MAP[h.status].knocked).length;
    return { knocked, total: visible.length, pct: visible.length ? Math.round((knocked / visible.length) * 100) : 0 };
  }, [visible]);

  // restore the workspace from IndexedDB on first paint
  useEffect(() => {
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
      // a demo build ships a starter list so the map is never empty on arrival
      const demo = getDemo();
      if (demo?.csv && !useStore.getState().households.length) {
        const sheets = await readWorkbook(new File([demo.csv], 'demo.csv', { type: 'text/csv' }));
        const sheet = sheets[0];
        if (sheet?.rows.length) {
          useStore.getState().importRows(sheet.rows, guessMapping(sheet.headers), sheet.headers, { replace: true });
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
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      void saveState(snapshot());
    };
    // canvassers lock the phone seconds after a knock — never lose that write
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    const unsubscribe = useStore.subscribe(() => {
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
        <button className="topbar__btn" onClick={() => setLayersOpen((v) => !v)} aria-label="Layers">
          ◍
        </button>
      </header>

      <main className="workspace">
        <div className="map-area">
          <MapView />
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
            setMenu('data');
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

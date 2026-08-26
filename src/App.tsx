import { useEffect, useRef, useState } from 'react';
import MapView from './components/MapView';
import Sidebar, { type TabId } from './components/Sidebar';
import HouseholdPanel from './components/HouseholdPanel';
import ImportWizard from './components/ImportWizard';
import { useStore } from './state/store';
import { loadState, saveState } from './lib/storage';
import { getDemo } from './lib/demo';
import { readWorkbook } from './lib/parse';
import { guessMapping } from './lib/normalize';

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const households = useStore((s) => s.households);
  const selectedId = useStore((s) => s.selectedHouseholdId);
  const activeCanvasser = useStore((s) => s.canvassers.find((c) => c.id === s.settings.activeCanvasserId));
  const toast = useStore((s) => s.toast);
  const [showImport, setShowImport] = useState(false);
  const [tab, setTab] = useState<TabId>('doors');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const saveTimer = useRef<number>();

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
      // the demo build ships a starter list so the map is never empty on arrival
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
    // canvassers close the tab seconds after a knock — never lose that write
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

  const empty = hydrated && households.length === 0;

  return (
    <div className={`app ${sidebarOpen ? '' : 'app--collapsed'} ${selectedId ? 'app--detail' : ''}`}>
      <header className="topbar">
        <button className="topbar__toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sidebar">
          ☰
        </button>
        <div className="brand">
          <span className="brand__mark">◈</span>
          <span>Doorknock</span>
        </div>
        <div className="topbar__spacer" />
        {activeCanvasser && (
          <span className="who" style={{ '--turf': activeCanvasser.color } as React.CSSProperties}>
            {activeCanvasser.name}
          </span>
        )}
        <button className="btn btn--ghost" onClick={() => useStore.getState().setMapMode('draw-turf')}>
          Cut turf
        </button>
        <button className="btn btn--primary" onClick={() => setShowImport(true)}>
          Upload list
        </button>
      </header>

      <main className="workspace">
        <Sidebar tab={tab} onTab={setTab} onOpenImport={() => setShowImport(true)} />
        <div className="map-area">
          <MapView />
          {empty && (
            <div className="empty">
              <div className="empty__card">
                <h1>Put your list on the map</h1>
                <p>
                  Upload a spreadsheet of people — names, street addresses, city, postal code — and every door
                  becomes a pin you can knock, tag and take notes on.
                </p>
                <button className="btn btn--primary btn--lg" onClick={() => setShowImport(true)}>
                  Upload a spreadsheet
                </button>
                <ol className="empty__steps">
                  <li>Upload .xlsx or .csv and confirm the columns</li>
                  <li>Geocode the addresses into pins</li>
                  <li>Cut turf, assign canvassers, start knocking</li>
                </ol>
              </div>
            </div>
          )}
        </div>
        <HouseholdPanel />
      </main>

      {showImport && (
        <ImportWizard
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            setTab('data');
          }}
        />
      )}

      {toast && (
        <div className={`toast ${toast.kind === 'error' ? 'toast--error' : ''}`} onClick={() => useStore.getState().dismissToast()}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

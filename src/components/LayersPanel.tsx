import { useMemo } from 'react';
import { COMMUNITIES } from '../lib/communities';
import { STATUSES, STATUS_MAP } from '../types';
import { useStore } from '../state/store';
import { getDemo } from '../lib/demo';
import { OFFLINE_BASEMAP } from './MapView';

interface Props {
  onClose: () => void;
}

/** The layer control: which groups show on the map, and what the colours mean. */
export default function LayersPanel({ onClose }: Props) {
  const households = useStore((s) => s.households);
  const hidden = useStore((s) => s.filters.hiddenCommunities);
  const colorBy = useStore((s) => s.settings.colorBy);
  const unknockedOnly = useStore((s) => s.filters.unknockedOnly);
  const basemap = useStore((s) => s.settings.basemap);
  const basemaps = getDemo()?.tiles ? ['Streets', 'Satellite', OFFLINE_BASEMAP] : ['Streets', 'Satellite'];

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    households.forEach((h) => map.set(h.community, (map.get(h.community) ?? 0) + 1));
    return map;
  }, [households]);

  return (
    <div className="sheet sheet--right" role="dialog" aria-label="Map layers">
      <header className="sheet__head">
        <h2>Layers</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <section className="sheet__section">
        <h3>Show on the map</h3>
        <ul className="layer-list">
          {COMMUNITIES.map((c) => {
            const count = counts.get(c.id) ?? 0;
            const on = !hidden.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  className={`layer-row ${on ? '' : 'layer-row--off'}`}
                  onClick={() => useStore.getState().toggleCommunityLayer(c.id)}
                  aria-pressed={on}
                >
                  <span className="layer-row__swatch" style={{ background: c.color }} />
                  <span className="layer-row__label">{c.label}</span>
                  <span className="layer-row__count">{count}</span>
                  <span className="layer-row__eye">{on ? '👁' : '—'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="btn-row">
          <button
            className="btn btn--ghost"
            onClick={() =>
              hidden.length
                ? useStore.getState().setFilters({ hiddenCommunities: [] })
                : useStore.getState().setFilters({ hiddenCommunities: COMMUNITIES.map((c) => c.id) })
            }
          >
            {hidden.length ? 'Show all groups' : 'Hide all groups'}
          </button>
        </div>
      </section>

      <section className="sheet__section">
        <h3>Pin colour means</h3>
        <div className="segmented">
          <button
            className={colorBy === 'community' ? 'on' : ''}
            onClick={() => useStore.getState().updateSettings({ colorBy: 'community' })}
          >
            Community
          </button>
          <button
            className={colorBy === 'response' ? 'on' : ''}
            onClick={() => useStore.getState().updateSettings({ colorBy: 'response' })}
          >
            Response
          </button>
        </div>
        <ul className="legend-list">
          {(colorBy === 'community' ? COMMUNITIES : STATUSES).map((item) => (
            <li key={item.id}>
              <i style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
        <p className="muted small">A tick on the pin always means the door has been knocked.</p>
      </section>

      <section className="sheet__section">
        <h3>Background map</h3>
        <div className="segmented">
          {basemaps.map((name) => (
            <button
              key={name}
              className={basemap === name ? 'on' : ''}
              onClick={() => useStore.getState().updateSettings({ basemap: name })}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <section className="sheet__section">
        <h3>Quick filter</h3>
        <button
          className={`filter-chip ${unknockedOnly ? 'filter-chip--on' : ''}`}
          onClick={() => useStore.getState().setFilters({ unknockedOnly: !unknockedOnly })}
        >
          Only doors not knocked yet
        </button>
        <p className="muted small">
          {households.filter((h) => !STATUS_MAP[h.status].knocked).length} doors still to knock.
        </p>
      </section>
    </div>
  );
}

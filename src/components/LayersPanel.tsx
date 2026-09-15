import { useMemo, useState } from 'react';
import { UNCLASSIFIED } from '../lib/communities';
import { STATUSES, STATUS_MAP } from '../types';
import { useStore } from '../state/store';
import { getDemo } from '../lib/demo';
import { OFFLINE_BASEMAP } from './MapView';

interface Props {
  onClose: () => void;
}

/** Which groups show on the map, what the colours mean, and where the map is. */
export default function LayersPanel({ onClose }: Props) {
  const households = useStore((s) => s.households);
  const groups = useStore((s) => s.communities);
  const hidden = useStore((s) => s.filters.hiddenCommunities);
  const colorBy = useStore((s) => s.settings.colorBy);
  const unknockedOnly = useStore((s) => s.filters.unknockedOnly);
  const basemap = useStore((s) => s.settings.basemap);
  const basemaps = getDemo()?.tiles ? ['Streets', 'Satellite', OFFLINE_BASEMAP] : ['Streets', 'Satellite'];
  const [newGroup, setNewGroup] = useState('');

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    households.forEach((h) => map.set(h.community, (map.get(h.community) ?? 0) + 1));
    return map;
  }, [households]);

  // a list with two groups in it should show two layers, not every preset — and
  // hiding a group must not make empty ones appear
  const groupsInUse = useMemo(() => groups.filter((c) => (counts.get(c.id) ?? 0) > 0), [groups, counts]);

  const showing = groupsInUse.filter((c) => !hidden.includes(c.id));
  const onlyOne = showing.length === 1 ? showing[0] : undefined;
  const shownDoors = groupsInUse.reduce((n, c) => (hidden.includes(c.id) ? n : n + (counts.get(c.id) ?? 0)), 0);

  return (
    <div className="sheet sheet--right" role="dialog" aria-label="Map layers">
      <header className="sheet__head">
        <h2>Who to show</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <section className="sheet__section">
        <p className="muted small">
          {onlyOne ? `Showing ${onlyOne.label} only` : `Showing ${shownDoors} of ${households.length} doors`}
        </p>
        <ul className="layer-list">
          {groupsInUse.map((c) => {
            const count = counts.get(c.id) ?? 0;
            const on = !hidden.includes(c.id);
            const isOnly = onlyOne?.id === c.id;
            return (
              <li key={c.id} className="layer-item">
                <button
                  className={`layer-row ${on ? '' : 'layer-row--off'}`}
                  onClick={() => useStore.getState().toggleCommunityLayer(c.id)}
                  aria-pressed={on}
                >
                  <span className="layer-row__swatch" style={{ background: c.color }} />
                  <span className="layer-row__label">{c.label}</span>
                  <span className="layer-row__count">{count}</span>
                  <span className="layer-row__eye" />
                </button>
                <button
                  className={`only-btn ${isOnly ? 'only-btn--on' : ''}`}
                  onClick={() => useStore.getState().showOnlyCommunity(isOnly ? undefined : c.id)}
                  title={isOnly ? 'Show everyone again' : `Show only ${c.label}`}
                >
                  {isOnly ? 'All' : 'Only'}
                </button>
              </li>
            );
          })}
        </ul>
        {hidden.length > 0 && (
          <button className="btn btn--ghost btn--block" onClick={() => useStore.getState().showOnlyCommunity(undefined)}>
            Show every group
          </button>
        )}
      </section>

      <section className="sheet__section">
        <h3>Add a group</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const label = newGroup.trim();
            if (!label) return;
            useStore.getState().addCommunity(label);
            setNewGroup('');
          }}
        >
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="Black, Portuguese, Tamil…"
            aria-label="New group name"
          />
          <button className="btn btn--primary" type="submit" disabled={!newGroup.trim()}>
            Add
          </button>
        </form>
        <p className="muted small">
          New groups appear when you tag a door, or when you import a list of them. Groups with no doors stay out
          of this list.
        </p>
      </section>

      <section className="sheet__section">
        <h3>Pin colour means</h3>
        <div className="segmented">
          <button
            className={colorBy === 'community' ? 'on' : ''}
            onClick={() => useStore.getState().updateSettings({ colorBy: 'community' })}
          >
            Group
          </button>
          <button
            className={colorBy === 'response' ? 'on' : ''}
            onClick={() => useStore.getState().updateSettings({ colorBy: 'response' })}
          >
            Response
          </button>
        </div>
        {colorBy === 'response' && (
          <ul className="legend-list">
            {STATUSES.map((item) => (
              <li key={item.id}>
                <i style={{ background: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
        )}
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
          {households.filter((h) => !STATUS_MAP[h.status].knocked && h.community !== UNCLASSIFIED).length} classified
          doors still to knock.
        </p>
      </section>
    </div>
  );
}

import { useMemo } from 'react';
import { STATUS_MAP } from '../types';
import { useStore } from '../state/store';

export default function TurfTab() {
  const turfs = useStore((s) => s.turfs);
  const households = useStore((s) => s.households);
  const canvassers = useStore((s) => s.canvassers);
  const filters = useStore((s) => s.filters);

  const stats = useMemo(() => {
    const map = new Map<string, { total: number; knocked: number }>();
    turfs.forEach((t) => map.set(t.id, { total: 0, knocked: 0 }));
    households.forEach((h) => {
      if (!h.turfId) return;
      const s = map.get(h.turfId);
      if (!s) return;
      s.total++;
      if (STATUS_MAP[h.status].knocked) s.knocked++;
    });
    return map;
  }, [turfs, households]);

  const unassigned = households.filter((h) => !h.turfId && h.lat !== undefined).length;

  return (
    <div className="pane">
      <button className="btn btn--primary btn--block" onClick={() => useStore.getState().setMapMode('draw-turf')}>
        ✏️ Cut new turf
      </button>
      <p className="muted small">
        Draw a shape on the map and every door inside becomes a turf. {unassigned} mapped door
        {unassigned === 1 ? '' : 's'} not in any turf.
      </p>

      <ul className="turf-list">
        {turfs.map((t) => {
          const s = stats.get(t.id) ?? { total: 0, knocked: 0 };
          const pct = s.total ? Math.round((s.knocked / s.total) * 100) : 0;
          const active = filters.turfId === t.id;
          return (
            <li key={t.id} className={`turf-card ${active ? 'turf-card--on' : ''}`} style={{ '--turf': t.color } as React.CSSProperties}>
              <div className="turf-card__head">
                <input
                  className="turf-card__name"
                  value={t.name}
                  onChange={(e) => useStore.getState().renameTurf(t.id, e.target.value)}
                />
                <button className="icon-btn" title="Delete turf" onClick={() => useStore.getState().deleteTurf(t.id)}>
                  🗑
                </button>
              </div>
              <div className="progress">
                <div className="progress__bar" style={{ width: `${pct}%` }} />
              </div>
              <p className="muted small">
                {s.knocked}/{s.total} doors knocked ({pct}%)
              </p>
              <div className="turf-card__foot">
                <select
                  value={t.canvasserId ?? ''}
                  onChange={(e) => useStore.getState().assignTurf(t.id, e.target.value || undefined)}
                >
                  <option value="">Unassigned</option>
                  {canvassers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--ghost"
                  onClick={() => useStore.getState().setFilters({ turfId: active ? undefined : t.id })}
                >
                  {active ? 'Show all' : 'Focus'}
                </button>
              </div>
            </li>
          );
        })}
        {!turfs.length && <li className="muted">No turf cut yet.</li>}
      </ul>
    </div>
  );
}

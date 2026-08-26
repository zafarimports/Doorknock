import { useMemo } from 'react';
import { STATUSES, STATUS_MAP } from '../types';
import { selectVisible, useStore } from '../state/store';

export default function StatsBar() {
  const visible = useStore(selectVisible);

  const stats = useMemo(() => {
    const byStatus = new Map<string, number>();
    let knocked = 0;
    visible.forEach((h) => {
      byStatus.set(h.status, (byStatus.get(h.status) ?? 0) + 1);
      if (STATUS_MAP[h.status].knocked) knocked++;
    });
    return { byStatus, knocked, total: visible.length };
  }, [visible]);

  const pct = stats.total ? Math.round((stats.knocked / stats.total) * 100) : 0;

  return (
    <div className="stats-bar">
      <div className="stats-bar__headline">
        <strong>{stats.knocked}</strong>
        <span className="muted"> of {stats.total} doors knocked</span>
        <span className="stats-bar__pct">{pct}%</span>
      </div>
      <div className="stats-bar__track">
        {STATUSES.filter((s) => stats.byStatus.get(s.id)).map((s) => (
          <div
            key={s.id}
            className="stats-bar__seg"
            style={{ width: `${((stats.byStatus.get(s.id) ?? 0) / stats.total) * 100}%`, background: s.color }}
            title={`${s.label}: ${stats.byStatus.get(s.id)}`}
          />
        ))}
      </div>
      <div className="legend">
        {STATUSES.filter((s) => stats.byStatus.get(s.id)).map((s) => (
          <span key={s.id} className="legend__item">
            <i style={{ background: s.color }} />
            {s.short} {stats.byStatus.get(s.id)}
          </span>
        ))}
      </div>
    </div>
  );
}

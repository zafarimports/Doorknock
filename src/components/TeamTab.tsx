import { useState } from 'react';
import { useStore } from '../state/store';

export default function TeamTab() {
  const canvassers = useStore((s) => s.canvassers);
  const turfs = useStore((s) => s.turfs);
  const activeId = useStore((s) => s.settings.activeCanvasserId);
  const filters = useStore((s) => s.filters);
  const [name, setName] = useState('');

  return (
    <div className="pane">
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          const c = useStore.getState().addCanvasser(trimmed);
          if (!activeId) useStore.getState().updateSettings({ activeCanvasserId: c.id });
          setName('');
        }}
      >
        <input placeholder="Add a canvasser" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn--primary" type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>

      <ul className="team-list">
        {canvassers.map((c) => {
          const assigned = turfs.filter((t) => t.canvasserId === c.id);
          return (
            <li key={c.id} className="team-card" style={{ '--turf': c.color } as React.CSSProperties}>
              <div className="team-card__head">
                <strong>{c.name}</strong>
                <code title="Share this code with the canvasser">{c.code}</code>
                <button className="icon-btn" onClick={() => useStore.getState().removeCanvasser(c.id)}>
                  🗑
                </button>
              </div>
              <p className="muted small">
                {assigned.length ? assigned.map((t) => t.name).join(', ') : 'No turf assigned'}
              </p>
              <div className="btn-row">
                <button
                  className={`btn ${activeId === c.id ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => useStore.getState().updateSettings({ activeCanvasserId: activeId === c.id ? undefined : c.id })}
                >
                  {activeId === c.id ? 'Knocking as this person' : 'Knock as this person'}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() =>
                    useStore.getState().setFilters({ canvasserId: filters.canvasserId === c.id ? undefined : c.id })
                  }
                >
                  {filters.canvasserId === c.id ? 'Show all doors' : 'Show their doors'}
                </button>
              </div>
            </li>
          );
        })}
        {!canvassers.length && (
          <li className="muted">
            Add the people knocking. Whoever is selected gets stamped on the notes and knocks they record.
          </li>
        )}
      </ul>
    </div>
  );
}

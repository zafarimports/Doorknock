import { useEffect, useMemo, useState } from 'react';
import { STATUSES, STATUS_MAP, type DoorStatus } from '../types';
import { peopleOf, useStore } from '../state/store';
import { useWalkOrder } from '../state/useVisible';
import { displayAddress } from '../lib/normalize';
import { COMMUNITIES } from '../lib/communities';

/** The four responses that cover almost every door. */
const PRIMARY: DoorStatus[] = ['support', 'not_home', 'undecided', 'oppose'];

const QUICK_TAGS = ['Sign requested', 'Volunteer', 'Needs ride', 'Language help', 'Dog', 'Follow up'];

const timeAgo = (ts: number): string => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
};

export default function HouseholdPanel() {
  const id = useStore((s) => s.selectedHouseholdId);
  const household = useStore((s) => s.households.find((h) => h.id === id));
  const residents = useStore((s) => (id ? peopleOf(s, id) : []));
  const turf = useStore((s) => s.turfs.find((t) => t.id === household?.turfId));
  const sourceColumns = useStore((s) => s.sourceColumns);
  const walk = useWalkOrder();

  const [note, setNote] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [allResponses, setAllResponses] = useState(false);

  const close = () => useStore.getState().select(undefined);

  useEffect(() => {
    setNote('');
    setShowRaw(false);
    setEditing(undefined);
    setAllResponses(false);
  }, [id]);

  // a door should close the way everything else on a phone closes
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  const position = useMemo(() => walk.findIndex((h) => h.id === id), [walk, id]);
  const extraColumns = useMemo(
    () => sourceColumns.filter((c) => residents.some((p) => p.raw[c])),
    [sourceColumns, residents],
  );

  if (!household) return null;

  const meta = STATUS_MAP[household.status];
  const go = (delta: number) => {
    const next = walk[position + delta];
    if (next) useStore.getState().select(next.id);
  };

  return (
    <>
      <button className="door-backdrop" onClick={close} aria-label="Close door" />
      <aside className="door-panel" role="dialog" aria-label={household.address}>
        <div className="door-grab" />
        <header className="door-panel__head">
          <div>
            <h2>{displayAddress(household.address, household.unit)}</h2>
            <p className="muted small">
              {[household.city, household.postal, household.poll].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        {meta.knocked && (
          <div className="knock-stamp">
            ✓ Knocked — {meta.label}
            <small>
              {household.lastVisitAt ? timeAgo(household.lastVisitAt) : ''}
              {household.visits > 1 ? ` · visit ${household.visits}` : ''}
            </small>
          </div>
        )}

        <section>
          <h3>What happened at the door?</h3>
          <div className="status-grid">
            {STATUSES.filter((s) => (allResponses ? true : PRIMARY.includes(s.id))).map((s) => (
              <button
                key={s.id}
                className={`status-chip ${household.status === s.id ? 'status-chip--on' : ''}`}
                style={{ '--chip': s.color } as React.CSSProperties}
                onClick={() => useStore.getState().setStatus(household.id, s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button className="link-btn" onClick={() => setAllResponses((v) => !v)}>
            {allResponses ? 'Fewer options' : 'More options'}
          </button>
        </section>

        <section className="door-panel__section">
          <h3>Community</h3>
          <div className="tag-row">
            {COMMUNITIES.filter((c) => c.id !== 'unknown').map((c) => (
              <button
                key={c.id}
                className={`community-chip ${household.community === c.id ? 'community-chip--on' : ''}`}
                style={{ '--chip': c.color } as React.CSSProperties}
                onClick={() =>
                  useStore
                    .getState()
                    .setCommunity(household.id, household.community === c.id ? 'unknown' : c.id)
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="muted small">
            {household.communitySource === 'file'
              ? 'From your list'
              : household.communitySource === 'manual'
                ? 'Set here at the door'
                : 'Not classified — tap a group to set it'}
          </p>
        </section>

        <section className="door-panel__section">
          <h3>
            {residents.length} resident{residents.length === 1 ? '' : 's'}
          </h3>
          <ul className="resident-list">
            {residents.map((p) => (
              <li key={p.id}>
                <div className="resident-list__row">
                  <div>
                    <strong>{p.name}</strong>
                    {p.occupancy && <span className="tag tag--soft">{p.occupancy}</span>}
                    {p.status && p.status !== household.status && (
                      <span className="tag" style={{ background: STATUS_MAP[p.status].color }}>
                        {STATUS_MAP[p.status].label}
                      </span>
                    )}
                    <div className="muted small">
                      {[p.phone, p.email].filter(Boolean).join(' · ') || 'No phone or email on file'}
                    </div>
                  </div>
                  <button className="link-btn" onClick={() => setEditing(editing === p.id ? undefined : p.id)}>
                    {editing === p.id ? 'Done' : 'Edit'}
                  </button>
                </div>
                {editing === p.id && (
                  <div className="resident-edit">
                    <input
                      placeholder="Phone"
                      defaultValue={p.phone ?? ''}
                      onBlur={(e) => useStore.getState().updatePerson(p.id, { phone: e.target.value })}
                    />
                    <input
                      placeholder="Email"
                      defaultValue={p.email ?? ''}
                      onBlur={(e) => useStore.getState().updatePerson(p.id, { email: e.target.value })}
                    />
                    <select
                      value={p.status ?? ''}
                      onChange={(e) =>
                        useStore.getState().updatePerson(p.id, { status: (e.target.value || undefined) as DoorStatus })
                      }
                    >
                      <option value="">Same as the door</option>
                      {STATUSES.filter((s) => s.id !== 'not_started').map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="door-panel__section">
          <h3>Notes</h3>
          <form
            className="note-form"
            onSubmit={(e) => {
              e.preventDefault();
              const text = note.trim();
              if (!text) return;
              useStore.getState().addNote(household.id, text);
              setNote('');
            }}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did they say?"
              rows={2}
            />
            <button className="btn btn--primary" type="submit" disabled={!note.trim()}>
              Add note
            </button>
          </form>
          <ul className="note-list">
            {household.notes.map((n) => (
              <li key={n.id}>
                <p>{n.text}</p>
                <div className="note-list__meta">
                  <span>
                    {n.author ? `${n.author} · ` : ''}
                    {new Date(n.at).toLocaleString()}
                  </span>
                  <button className="link-btn" onClick={() => useStore.getState().deleteNote(household.id, n.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {!household.notes.length && <li className="muted small">No notes yet.</li>}
          </ul>
        </section>

        <section className="door-panel__section">
          <h3>Tags</h3>
          <div className="tag-row">
            {QUICK_TAGS.map((t) => (
              <button
                key={t}
                className={`tag-btn ${household.tags.includes(t) ? 'tag-btn--on' : ''}`}
                onClick={() => useStore.getState().toggleTag(household.id, t)}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="door-panel__section">
          <h3>Location</h3>
          <p className="muted small">
            {household.geocode === 'ok' && 'Found automatically'}
            {household.geocode === 'manual' && 'Placed by hand'}
            {household.geocode === 'pending' && 'Waiting to be put on the map'}
            {household.geocode === 'failed' && 'Could not be found — place it by hand'}
            {turf && ` · ${turf.name}`}
          </p>
          <div className="btn-row">
            <button className="btn btn--ghost" onClick={() => useStore.getState().setMapMode('place-pin', household.id)}>
              {household.lat === undefined ? 'Place on map' : 'Move pin'}
            </button>
            {household.lat !== undefined && (
              <a
                className="btn btn--ghost"
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&destination=${household.lat},${household.lng}`}
              >
                Directions
              </a>
            )}
          </div>
        </section>

        {extraColumns.length > 0 && (
          <section className="door-panel__section">
            <button className="link-btn" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? 'Hide' : 'Show'} everything from the spreadsheet
            </button>
            {showRaw && (
              <div className="raw-fields">
                {residents.map((p) => (
                  <div key={p.id}>
                    <h4>{p.name}</h4>
                    <dl>
                      {extraColumns.map((c) =>
                        p.raw[c] ? (
                          <div key={c}>
                            <dt>{c}</dt>
                            <dd>{p.raw[c]}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="door-nav">
          <button className="btn" disabled={position <= 0} onClick={() => go(-1)}>
            ← Previous
          </button>
          <button className="btn btn--primary" disabled={position < 0 || position >= walk.length - 1} onClick={() => go(1)}>
            Next door →
          </button>
        </div>
      </aside>
    </>
  );
}

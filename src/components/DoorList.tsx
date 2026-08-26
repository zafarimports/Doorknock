import { useMemo, useState } from 'react';
import { STATUSES, STATUS_MAP, type Household } from '../types';
import { selectVisible, useStore } from '../state/store';
import { distance, formatDistance } from '../lib/geo';

type SortKey = 'walk' | 'name' | 'status' | 'nearby';

export default function DoorList() {
  const visible = useStore(selectVisible);
  const people = useStore((s) => s.people);
  const filters = useStore((s) => s.filters);
  const turfs = useStore((s) => s.turfs);
  const households = useStore((s) => s.households);
  const selectedId = useStore((s) => s.selectedHouseholdId);
  const [sort, setSort] = useState<SortKey>('walk');
  const [here, setHere] = useState<[number, number]>();
  const [limit, setLimit] = useState(120);

  const namesByHousehold = useMemo(() => {
    const map = new Map<string, string[]>();
    people.forEach((p) => {
      const list = map.get(p.householdId) ?? [];
      list.push(p.name);
      map.set(p.householdId, list);
    });
    return map;
  }, [people]);

  const polls = useMemo(
    () => [...new Set(households.map((h) => h.poll).filter(Boolean))].sort() as string[],
    [households],
  );
  const cities = useMemo(
    () => [...new Set(households.map((h) => h.city).filter(Boolean))].sort() as string[],
    [households],
  );

  const sorted = useMemo(() => {
    const list = [...visible];
    const cmp: Record<SortKey, (a: Household, b: Household) => number> = {
      walk: (a, b) =>
        (a.street ?? '').localeCompare(b.street ?? '') || (a.houseNumber ?? 0) - (b.houseNumber ?? 0),
      name: (a, b) =>
        (namesByHousehold.get(a.id)?.[0] ?? '').localeCompare(namesByHousehold.get(b.id)?.[0] ?? ''),
      status: (a, b) => STATUSES.findIndex((s) => s.id === a.status) - STATUSES.findIndex((s) => s.id === b.status),
      nearby: (a, b) => {
        if (!here) return 0;
        const da = a.lat !== undefined ? distance(here, [a.lat, a.lng!]) : Infinity;
        const db = b.lat !== undefined ? distance(here, [b.lat, b.lng!]) : Infinity;
        return da - db;
      },
    };
    return list.sort(cmp[sort]);
  }, [visible, sort, here, namesByHousehold]);

  const locate = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere([pos.coords.latitude, pos.coords.longitude]);
        setSort('nearby');
      },
      () => useStore.getState().notify('Could not get your location', 'error'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const toggleStatus = (id: (typeof STATUSES)[number]['id']) => {
    const next = filters.statuses.includes(id)
      ? filters.statuses.filter((s) => s !== id)
      : [...filters.statuses, id];
    useStore.getState().setFilters({ statuses: next });
  };

  return (
    <div className="door-list">
      <div className="door-list__controls">
        <input
          className="search"
          placeholder="Search name, street, postal code…"
          value={filters.search}
          onChange={(e) => useStore.getState().setFilters({ search: e.target.value })}
        />
        <div className="filter-row">
          <select value={filters.poll ?? ''} onChange={(e) => useStore.getState().setFilters({ poll: e.target.value || undefined })}>
            <option value="">All polls</option>
            {polls.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select value={filters.city ?? ''} onChange={(e) => useStore.getState().setFilters({ city: e.target.value || undefined })}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={filters.turfId ?? ''} onChange={(e) => useStore.getState().setFilters({ turfId: e.target.value || undefined })}>
            <option value="">All turf</option>
            {turfs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => (e.target.value === 'nearby' ? locate() : setSort(e.target.value as SortKey))}>
            <option value="walk">Walk order</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="nearby">Closest to me</option>
          </select>
        </div>
        <div className="chip-row">
          <button
            className={`filter-chip ${filters.unknockedOnly ? 'filter-chip--on' : ''}`}
            onClick={() => useStore.getState().setFilters({ unknockedOnly: !filters.unknockedOnly })}
          >
            Not knocked yet
          </button>
          {STATUSES.filter((s) => s.id !== 'not_started').map((s) => (
            <button
              key={s.id}
              className={`filter-chip ${filters.statuses.includes(s.id) ? 'filter-chip--on' : ''}`}
              style={{ '--chip': s.color } as React.CSSProperties}
              onClick={() => toggleStatus(s.id)}
            >
              {s.label}
            </button>
          ))}
          {(filters.statuses.length > 0 ||
            filters.search ||
            filters.poll ||
            filters.city ||
            filters.turfId ||
            filters.unknockedOnly) && (
            <button className="filter-chip filter-chip--clear" onClick={() => useStore.getState().resetFilters()}>
              Clear
            </button>
          )}
        </div>
        <p className="muted small">
          {sorted.length} of {households.length} doors
        </p>
      </div>

      <ul className="door-list__items">
        {sorted.slice(0, limit).map((h) => {
          const meta = STATUS_MAP[h.status];
          const names = namesByHousehold.get(h.id) ?? [];
          return (
            <li key={h.id}>
              <button
                className={`door-row ${h.id === selectedId ? 'door-row--on' : ''}`}
                onClick={() => useStore.getState().select(h.id)}
              >
                <span className="door-row__dot" style={{ background: meta.color }}>
                  {meta.knocked ? '✓' : ''}
                </span>
                <span className="door-row__body">
                  <strong>
                    {h.address}
                    {h.unit ? ` · ${h.unit}` : ''}
                  </strong>
                  <small className="muted">
                    {names.slice(0, 2).join(', ')}
                    {names.length > 2 ? ` +${names.length - 2}` : ''}
                  </small>
                  <small className="muted">
                    {[h.city, h.poll].filter(Boolean).join(' · ')}
                    {here && h.lat !== undefined ? ` · ${formatDistance(distance(here, [h.lat, h.lng!]))}` : ''}
                  </small>
                </span>
                <span className="door-row__flags">
                  {h.notes.length > 0 && <span title={`${h.notes.length} notes`}>🗒 {h.notes.length}</span>}
                  {h.geocode === 'failed' && <span className="warn" title="No location">⚑</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {sorted.length > limit && (
        <button className="btn btn--ghost btn--block" onClick={() => setLimit((l) => l + 200)}>
          Show more ({sorted.length - limit} left)
        </button>
      )}
    </div>
  );
}

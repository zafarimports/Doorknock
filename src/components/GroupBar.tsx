import { useMemo } from 'react';
import { useStore } from '../state/store';

/**
 * The group filter, sitting on the map where it cannot be missed: one chip per
 * group with doors in it, tap to walk just that group. The Layers panel can do
 * the same thing and more, but a canvasser should not have to find a panel to
 * answer "show me the Muslim doors".
 */
export default function GroupBar() {
  const households = useStore((s) => s.households);
  const groups = useStore((s) => s.communities);
  const hidden = useStore((s) => s.filters.hiddenCommunities);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    households.forEach((h) => map.set(h.community, (map.get(h.community) ?? 0) + 1));
    return map;
  }, [households]);

  const inUse = useMemo(() => groups.filter((c) => (counts.get(c.id) ?? 0) > 0), [groups, counts]);
  if (inUse.length < 2) return null;

  const showing = inUse.filter((c) => !hidden.includes(c.id));
  const onlyOne = showing.length === 1 ? showing[0] : undefined;

  return (
    <div className="group-bar" role="group" aria-label="Filter the map by group">
      <button
        className={`group-chip ${onlyOne ? '' : 'group-chip--on'}`}
        onClick={() => useStore.getState().showOnlyCommunity(undefined)}
      >
        All doors
        <span className="group-chip__count">{households.length}</span>
      </button>
      {inUse.map((c) => (
        <button
          key={c.id}
          className={`group-chip ${onlyOne?.id === c.id ? 'group-chip--on' : ''}`}
          style={{ '--chip': c.color } as React.CSSProperties}
          onClick={() => useStore.getState().showOnlyCommunity(onlyOne?.id === c.id ? undefined : c.id)}
          aria-pressed={onlyOne?.id === c.id}
        >
          <span className="group-chip__dot" />
          {c.label}
          <span className="group-chip__count">{counts.get(c.id)}</span>
        </button>
      ))}
    </div>
  );
}

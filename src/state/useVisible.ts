import { useMemo } from 'react';
import type { Household } from '../types';
import { selectVisible, useStore } from './store';

/**
 * The doors passing the current filters, with a stable identity.
 *
 * Selecting through `useStore(selectVisible)` would build a fresh array on every
 * store change — including each GPS fix and each geocoded address — and that
 * array feeds the map's marker effect, so the whole marker set would be rebuilt
 * several times a second while walking. Memoising on the inputs keeps it still.
 */
export function useVisibleHouseholds(): Household[] {
  const households = useStore((s) => s.households);
  const people = useStore((s) => s.people);
  const turfs = useStore((s) => s.turfs);
  const filters = useStore((s) => s.filters);

  return useMemo(
    () => selectVisible({ households, people, turfs, filters } as Parameters<typeof selectVisible>[0]),
    [households, people, turfs, filters],
  );
}

/** Visible doors in walk order: along a street, by house number. */
export function useWalkOrder(): Household[] {
  const visible = useVisibleHouseholds();
  return useMemo(
    () =>
      [...visible].sort(
        (a, b) => (a.street ?? '').localeCompare(b.street ?? '') || (a.houseNumber ?? 0) - (b.houseNumber ?? 0),
      ),
    [visible],
  );
}

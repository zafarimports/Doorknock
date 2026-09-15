import type { ProjectFile } from '../types';
import { useStore } from '../state/store';

/**
 * A build can ship `preload.json` — a project file exported from this app — so
 * the first launch already shows the ward, tagged and placed, rather than an
 * empty map and a file picker. It is optional: without the file this is a no-op,
 * which is what keeps voter data out of the public web build.
 *
 * Returns true when a list was loaded.
 */
export async function loadPreloadedProject(): Promise<boolean> {
  try {
    const res = await fetch('preload.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const project = (await res.json()) as ProjectFile;
    if (project?.version !== 1 || !Array.isArray(project.households) || !project.households.length) return false;

    useStore.getState().loadProject(project);
    const only = project.initialFilter?.onlyCommunity;
    if (only) useStore.getState().showOnlyCommunity(only);

    const group = useStore.getState().communities.find((c) => c.id === only);
    const shown = only
      ? useStore.getState().households.filter((h) => h.community === only).length
      : project.households.length;
    useStore
      .getState()
      .notify(
        group
          ? `${shown} ${group.label} doors ready — tap ◍ to show everyone`
          : `${project.households.length} doors ready`,
      );
    return true;
  } catch {
    return false;
  }
}

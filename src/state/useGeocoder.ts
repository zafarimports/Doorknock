import { useCallback, useEffect, useRef } from 'react';
import { runGeocoder } from '../lib/geocode';
import { useStore } from './store';

/** Drives the geocoding queue; only one run can be in flight at a time. */
export function useGeocoder() {
  const controllerRef = useRef<AbortController | null>(null);
  const running = useStore((s) => s.geocodeRunning);
  const progress = useStore((s) => s.geocodeProgress);
  const errors = useStore((s) => s.geocodeErrors);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    useStore.getState().setGeocodeRunning(false);
  }, []);

  const start = useCallback(
    async (opts: { retryFailed?: boolean } = {}) => {
      const state = useStore.getState();
      if (state.geocodeRunning) return;
      const queue = state.households.filter((h) =>
        opts.retryFailed ? h.geocode === 'pending' || h.geocode === 'failed' : h.geocode === 'pending',
      );
      if (!queue.length) {
        state.notify('Every door already has a location.');
        return;
      }
      if (state.settings.geocoder === 'mapbox' && !state.settings.mapboxToken.trim()) {
        state.notify('Add a Mapbox token in Data & settings first.', 'error');
        return;
      }

      const controller = new AbortController();
      controllerRef.current = controller;
      useStore.getState().registerGeocodeAbort(() => controller.abort());
      state.setGeocodeRunning(true);
      state.setGeocodeProgress({ done: 0, total: queue.length, ok: 0, failed: 0 });

      try {
        await runGeocoder({
          households: queue,
          settings: state.settings,
          signal: controller.signal,
          ignoreCachedMisses: opts.retryFailed,
          onResult: (id, hit) => useStore.getState().applyGeocode(id, hit),
          onProgress: (p) => useStore.getState().setGeocodeProgress(p),
          onError: (message) => useStore.getState().pushGeocodeError(message),
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          useStore.getState().notify(err instanceof Error ? err.message : 'Geocoding failed', 'error');
        }
      } finally {
        controllerRef.current = null;
        useStore.getState().registerGeocodeAbort(undefined);
        useStore.getState().setGeocodeRunning(false);
        useStore.getState().recomputeTurfMembership();
      }
    },
    [],
  );

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { start, stop, running, progress, errors };
}

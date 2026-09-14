import { Geolocation, type Position } from '@capacitor/geolocation';

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number;
}

export interface WatchHandlers {
  onFix: (fix: Fix) => void;
  onError: (message: string, denied: boolean) => void;
}

const toFix = (p: Position): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracy: Math.max(p.coords.accuracy ?? 0, 5),
  heading:
    typeof p.coords.heading === 'number' && !Number.isNaN(p.coords.heading) ? p.coords.heading : undefined,
});

/**
 * Follows the canvasser as they walk. Uses Capacitor's plugin, which is the
 * native GPS in the Android app and `navigator.geolocation` in a browser, so the
 * permission prompt is the right one on each platform.
 *
 * Returns a function that stops the watch.
 */
export function watchPosition({ onFix, onError }: WatchHandlers): () => void {
  let watchId: string | undefined;
  let cancelled = false;

  const start = async () => {
    try {
      const status = await Geolocation.checkPermissions();
      if (status.location !== 'granted') {
        const asked = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (asked.location !== 'granted') {
          onError('Location is off — allow location access to see yourself on the map', true);
          return;
        }
      }
    } catch {
      // some browsers have no permissions API; fall through and let the watch ask
    }
    if (cancelled) return;

    try {
      watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 },
        (position, err) => {
          if (err) {
            const denied = /denied|permission/i.test(err.message ?? '');
            onError(
              denied
                ? 'Location is off — allow location access to see yourself on the map'
                : 'Could not get your location',
              denied,
            );
            return;
          }
          if (position) onFix(toFix(position));
        },
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not start location', false);
    }
  };

  void start();

  return () => {
    cancelled = true;
    if (watchId) void Geolocation.clearWatch({ id: watchId });
  };
}

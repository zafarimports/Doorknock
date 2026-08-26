export type LatLng = [number, number];

/** Ray casting; ring is a closed-or-open list of [lat, lng]. */
export function pointInPolygon(point: LatLng, ring: LatLng[]): boolean {
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres between two points. */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

/** Spreads pins that geocode to the exact same point (apartment blocks, rooftop hits). */
export function jitter(lat: number, lng: number, index: number): LatLng {
  if (index === 0) return [lat, lng];
  const golden = 2.399963;
  const r = 0.000035 * Math.sqrt(index);
  return [lat + r * Math.cos(index * golden), lng + r * Math.sin(index * golden) * 1.6];
}

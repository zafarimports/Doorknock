/**
 * Optional demo payload. A build can define `window.__DOORKNOCK_DEMO__` with a
 * starter list and a pack of pre-fetched map tiles, which lets the app run as a
 * self-contained page with no network at all — used for the shareable preview.
 */
export interface DemoPayload {
  /** CSV text imported on first run when the workspace is empty */
  csv?: string;
  /** "z/x/y" -> data: URI */
  tiles?: Record<string, string>;
  /** highest zoom level present in the tile pack */
  maxNativeZoom?: number;
  note?: string;
}

export function getDemo(): DemoPayload | undefined {
  return (window as unknown as { __DOORKNOCK_DEMO__?: DemoPayload }).__DOORKNOCK_DEMO__;
}

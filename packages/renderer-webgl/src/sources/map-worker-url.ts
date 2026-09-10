import * as maplibregl from 'maplibre-gl';

/**
 * Points MapLibre at the bundled URL of its own worker script.
 *
 * @remarks
 * MapLibre 6 ships its worker as a separate ES module and derives the URL from
 * `import.meta.url` of whatever file the bundler produced — a sibling
 * `maplibre-gl-worker.mjs` next to the app bundle, which no bundler emits. The
 * request 404s, the worker never starts, and **every** source stays unloaded
 * forever: a blank map that reports no error, and a PNG export that waits for
 * an `idle` the map can never reach.
 *
 * Only the composition root can resolve that URL, since it is the one place
 * compiled by the bundler rather than by `tsc`. This wrapper keeps the
 * MapLibre name on this side of the port (ADR-0001) while the app supplies the
 * bundler-specific URL.
 *
 * Must run before the first map is constructed — the worker pool is created on
 * first use and never rebuilt.
 */
export function setMapWorkerUrl(url: string): void {
  maplibregl.setWorkerUrl(url);
}

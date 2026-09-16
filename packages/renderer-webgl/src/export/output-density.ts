/**
 * Re-export shim: the output-density ↔ zoom conversion now lives in `@vellum/core`.
 *
 * @remarks
 * The formula is pure arithmetic over the CS1 constants and carries no MapLibre
 * dependency, so it moved to the domain layer where the full-map framing math
 * can consume it without importing this adapter (ADR-0001). This module stays
 * as a barrel so the adapter's own relative imports keep working.
 */
export { zoomForWorldUnitsPerPixel } from '@vellum/core';

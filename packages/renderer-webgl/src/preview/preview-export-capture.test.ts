import {
  DEFAULT_LAYER_OPTIONS,
  LAYER_NAMES,
  type LayerVisibility,
  type RenderStyleParams,
} from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';
import type * as maplibregl from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { zoomForWorldUnitsPerPixel } from '../export/output-density';
import {
  PREVIEW_LONG_EDGE_PX,
  buildPreviewExportSnapshot,
  pngBytesToDataUrl,
  previewAnnotationsFromSnapshot,
  previewScaleFromSnapshot,
  toPreviewSnapshot,
} from './preview-export-capture';

const ALL_LAYERS_VISIBLE = Object.fromEntries(
  LAYER_NAMES.map((layer) => [layer, true]),
) as LayerVisibility;

const STYLE = { mapBackground: '#fff' } as unknown as RenderStyleParams;

/** Live map stand-in: every method a preview snapshot reads, and nothing else. */
function makeMap(
  canvas: { clientWidth: number; clientHeight: number } = {
    clientWidth: 1440,
    clientHeight: 900,
  },
): maplibregl.Map {
  return {
    getCanvas: () => canvas,
    getCenter: () => ({ lng: 0.004, lat: -0.002 }),
    getZoom: () => 13.5,
    getBearing: () => 42,
    getPitch: () => 30,
    getBounds: () => ({
      getWest: () => -0.01,
      getEast: () => 0.01,
      getNorth: () => 0.01,
      getSouth: () => -0.01,
    }),
  } as unknown as maplibregl.Map;
}

function buildInput(
  options: { area: 'viewport' | 'full-map'; background: 'white' | 'dark' },
  map = makeMap(),
) {
  return {
    map,
    cityData: makeCityData(),
    style: STYLE,
    activeLayers: ALL_LAYERS_VISIBLE,
    layerOptions: DEFAULT_LAYER_OPTIONS,
    transitDimming: false,
    watermarkVisible: true,
    options,
  };
}

describe('buildPreviewExportSnapshot', () => {
  it('frames a full-map preview on the city bounds plus the frame margin', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'full-map', background: 'white' }),
    );

    // Same reservation the real full-map export makes, so the preview shows
    // the frame the file will contain rather than a version clipped at the
    // border.
    expect(snapshot?.extent.maxX).toBeGreaterThan(8640);
    expect(snapshot?.extent.minX).toBe(-(snapshot?.extent.maxX ?? 0));
    expect(
      Math.max(snapshot?.surface.width ?? 0, snapshot?.surface.height ?? 0),
    ).toBe(PREVIEW_LONG_EDGE_PX);
  });

  it('frames the full-map camera on the padded extent, not the live camera', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'full-map', background: 'dark' }),
    )!;

    // North-up, like the exporter's own neutralization…
    expect(snapshot.camera.bearing).toBe(0);
    expect(snapshot.camera.pitch).toBe(0);
    // …and centred on the extent at the density that maps it edge to edge.
    // Without this the capture surface falls back to fitting the bare city
    // bounds, which reserves nothing for the map frame.
    expect(snapshot.camera.longitude).toBeCloseTo(0, 10);
    expect(snapshot.camera.latitude).toBeCloseTo(0, 10);
    expect(snapshot.camera.zoom).toBeCloseTo(
      zoomForWorldUnitsPerPixel(
        (snapshot.extent.maxX - snapshot.extent.minX) / snapshot.surface.width,
      ),
      6,
    );
    expect(snapshot.camera.zoom).not.toBe(13.5);
  });

  it('carries a neutral presentation so the render bakes in no marginalia', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'viewport', background: 'white' }),
    )!;

    // The dialog draws legends and identity over the image itself; a render
    // that also contained them would show every one of them twice.
    expect(snapshot.request.presentation).toEqual({
      showCityName: false,
      showVellumLogo: false,
      showSourceFile: false,
      showGeneratedAt: false,
      showDistrictNames: false,
      showParkNames: false,
      showLayerLegend: false,
      showRoadLegend: false,
      showTransitLegend: false,
      showElevationLegend: false,
      showScaleBar: false,
      showOrientation: false,
      showSummary: false,
    });
  });

  it('keeps the live camera and downscales the canvas for a viewport preview', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'viewport', background: 'white' }),
    );

    expect(snapshot?.camera.bearing).toBe(42);
    expect(snapshot?.camera.pitch).toBe(30);
    // 1440x900 scaled so the long edge is the preview's, aspect preserved.
    expect(snapshot?.surface).toEqual({
      width: PREVIEW_LONG_EDGE_PX,
      height: Math.round((PREVIEW_LONG_EDGE_PX * 900) / 1440),
    });
    // Half the surface, one zoom level less: the preview covers the same
    // ground as the viewport it stands for instead of cropping into it.
    expect(snapshot?.camera.zoom).toBeCloseTo(12.5, 10);
  });

  it('never upscales a canvas smaller than the preview', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput(
        { area: 'viewport', background: 'white' },
        makeMap({ clientWidth: 320, clientHeight: 200 }),
      ),
    );

    expect(snapshot?.surface).toEqual({ width: 320, height: 200 });
  });

  it('carries the chosen background into the request the capture renders', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'viewport', background: 'dark' }),
    );

    expect(snapshot?.request.background).toBe('dark');
  });

  it('returns null when the live surface has no usable size', () => {
    expect(
      buildPreviewExportSnapshot(
        buildInput(
          { area: 'viewport', background: 'white' },
          makeMap({ clientWidth: 0, clientHeight: 0 }),
        ),
      ),
    ).toBeNull();
  });
});

describe('previewScaleFromSnapshot', () => {
  it('derives the bar from the snapshot density, not from the live camera', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'full-map', background: 'white' }),
    )!;

    const scale = previewScaleFromSnapshot(snapshot)!;
    const metresPerPixel =
      (snapshot.extent.maxX - snapshot.extent.minX) / snapshot.surface.width;
    expect(scale.widthPercent).toBeCloseTo(
      (scale.distanceMeters / metresPerPixel / snapshot.surface.width) * 100,
      10,
    );
    expect(scale.distanceMeters).toBeGreaterThan(0);
  });
});

describe('previewAnnotationsFromSnapshot', () => {
  it('projects labels linearly onto the extent, with Y descending from maxZ', () => {
    const cityData = makeCityData({
      districts: [
        {
          id: 'district-1',
          name: 'Centro',
          position: { x: 0, z: 0 },
        },
      ] as never,
      parkAreas: [
        {
          id: 'park-1',
          name: 'Norte',
          position: { x: 0, z: 8640 },
        },
      ] as never,
    });
    const snapshot = buildPreviewExportSnapshot({
      ...buildInput({ area: 'full-map', background: 'white' }),
      cityData,
    })!;

    const annotations = previewAnnotationsFromSnapshot(snapshot);
    const centro = annotations.find((item) => item.id === 'district-1');
    const norte = annotations.find((item) => item.id === 'park-1');

    expect(centro).toMatchObject({ xPercent: 50, yPercent: 50 });
    // Increasing Z is the top of the image, so a northern park sits above
    // the centre rather than below it.
    expect(norte!.yPercent).toBeLessThan(50);
  });

  it('drops labels the frame does not contain', () => {
    const cityData = makeCityData({
      districts: [
        { id: 'far', name: 'Lejos', position: { x: 90_000, z: 0 } },
      ] as never,
    });
    const snapshot = buildPreviewExportSnapshot({
      ...buildInput({ area: 'full-map', background: 'white' }),
      cityData,
    })!;

    expect(previewAnnotationsFromSnapshot(snapshot)).toEqual([]);
  });
});

describe('toPreviewSnapshot', () => {
  const SOURCE = {
    viewportSurface: { width: 1440, height: 900 },
    liveBearingDegrees: 42,
  };

  it('reports the preview image and the viewport document separately', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'viewport', background: 'white' }),
    )!;

    const preview = toPreviewSnapshot(snapshot, Uint8Array.from([1, 2, 3]), {
      ...SOURCE,
      projection: null,
    })!;

    expect(preview.width).toBe(snapshot.surface.width);
    expect(preview.viewportSurface).toEqual({ width: 1440, height: 900 });
  });

  it('keeps the live bearing alongside the captured composition’s', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'full-map', background: 'white' }),
    )!;

    const preview = toPreviewSnapshot(snapshot, new Uint8Array(), SOURCE)!;

    expect(preview.bearingDegrees).toBe(0);
    expect(preview.liveBearingDegrees).toBe(42);
  });

  it('prefers the live projection over the extent when one is supplied', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'viewport', background: 'white' }),
    )!;
    const projection = {
      scale: { distanceMeters: 250, widthPercent: 17 },
      annotations: [
        {
          id: 'district-1',
          name: 'Centro',
          kind: 'district' as const,
          xPercent: 12,
          yPercent: 34,
        },
      ],
    };

    const preview = toPreviewSnapshot(snapshot, new Uint8Array(), {
      ...SOURCE,
      projection,
    })!;

    expect(preview.scale).toEqual(projection.scale);
    expect(preview.annotations).toEqual(projection.annotations);
  });

  it('returns null when the snapshot has no usable density', () => {
    const snapshot = buildPreviewExportSnapshot(
      buildInput({ area: 'viewport', background: 'white' }),
    )!;
    const degenerate = {
      ...snapshot,
      extent: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    };

    // A zero-width extent yields no metres per pixel, so there is no honest
    // scale bar to draw — better no preview than one with a meaningless scale.
    expect(
      toPreviewSnapshot(degenerate, new Uint8Array(), {
        ...SOURCE,
        projection: null,
      }),
    ).toBeNull();
  });
});

describe('pngBytesToDataUrl', () => {
  it('encodes a payload larger than one chunk', () => {
    // 0x8000 bytes per chunk: `String.fromCharCode(...bytes)` on a whole
    // preview PNG blows the argument limit, which is why this is chunked at
    // all — and 4-byte fixtures never reach that path.
    const bytes = Uint8Array.from(
      { length: 0x8000 * 2 + 17 },
      (_, index) => index % 256,
    );

    const dataUrl = pngBytesToDataUrl(bytes);

    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const decoded = atob(dataUrl.slice('data:image/png;base64,'.length));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(decoded.length - 1)).toBe(
      bytes[bytes.length - 1],
    );
    expect(decoded.charCodeAt(0x8000)).toBe(bytes[0x8000]);
  });
});

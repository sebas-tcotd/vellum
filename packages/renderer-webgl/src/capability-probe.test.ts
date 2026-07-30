import type { CapabilityReport, ExportSnapshot } from '@vellum/core';
import { describe, expect, it } from 'vitest';
import { CapabilityProbe } from './capability-probe';

const report: CapabilityReport = {
  contextType: 'webgl2',
  webgl2: true,
  maxTextureSize: 4096,
  maxRenderbufferSize: 4096,
  maxViewportDims: [4096, 4096],
  maxCanvasSize: 4096,
  toBlob: true,
  memoryAvailableBytes: 'unknown',
};

function snapshot(): ExportSnapshot {
  return {
    camera: { longitude: 0, latitude: 0, zoom: 1, bearing: 0, pitch: 0 },
    extent: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    surface: { width: 6000, height: 3000 },
    request: { area: 'viewport' },
  } as unknown as ExportSnapshot;
}

describe('CapabilityProbe.decide', () => {
  it('accepts a large output when a real tile plan fits the GPU', () => {
    expect(new CapabilityProbe().decide(report, snapshot())).toEqual({
      eligible: true,
    });
  });

  it('preserves the feature-flag shortcut and propagates planner rejection', () => {
    const probe = new CapabilityProbe();
    expect(probe.decide(report, snapshot(), false)).toEqual({
      eligible: false,
      reason: 'flag',
    });
    expect(
      probe.decide(
        {
          ...report,
          maxCanvasSize: 100,
          maxTextureSize: 100,
          maxRenderbufferSize: 100,
          maxViewportDims: [100, 100],
        },
        snapshot(),
      ),
    ).toEqual({ eligible: false, reason: 'dimensions' });
  });
});

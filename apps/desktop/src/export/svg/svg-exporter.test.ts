import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AppendAck,
  ExportBeginMetadata,
  ExportReceipt,
  ExportSession,
  SvgExportSink,
  SvgExportSnapshot,
  SvgTextChunk,
} from '@vellum/core';
import { createSvgExportSnapshot, DEFAULT_LAYER_OPTIONS } from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';
import { buildCartographicScene } from '@vellum/renderer-webgl';
import { SvgExportCapabilityError, SvgExporter } from './svg-exporter';
import { runSvgSerialization } from './svg-serialization-driver';
import type {
  SvgWorkerCommand,
  SvgWorkerEvent,
  SvgWorkerReply,
} from './svg-worker-protocol';

/**
 * The scene builder reads `style` through `resolveColors`, so a stub would
 * throw on the first missing group. The layers are all switched off in the
 * snapshot below, which keeps the fixture honest about what it actually
 * exercises: streaming, ACK gating, and the transactional order.
 */
const STYLE = {
  mapBackground: '#ffffff',
  transitBackground: '#101010',
  mapFrame: '#000000',
  water: '#a0c8f0',
  terrain: {
    base: '#e8e0d8',
    low: '#d9e6c3',
    mid: '#c9b98a',
    high: '#f2f2f2',
  },
  contourLine: '#b0a080',
  forests: '#3f7d3f',
  districts: { fill: '#cc4444', label: '#222222' },
  buildings: {
    none: { fill: '#d0d0d0', stroke: '#909090' },
    civic: {
      publicTransport: { fill: '#8888cc', stroke: '#444488' },
      education: { fill: '#cc88cc', stroke: '#884488' },
      services: { fill: '#88cccc', stroke: '#448888' },
    },
  },
  roads: {
    highway: { generic: { fill: '#e8a33d', casing: '#b87a1d' } },
    largeArterial: { generic: { fill: '#f5d76e', casing: '#c9a63e' } },
    mediumArterial: { generic: { fill: '#ffffff', casing: '#c0c0c0' } },
    local: {
      generic: { fill: '#ffffff', casing: '#d0d0d0' },
      gravel: { fill: '#e0d8c8', casing: '#b0a890' },
    },
    pedestrian: {
      path: { fill: '#f0e0d0', casing: '#c0b0a0' },
      way: { fill: '#f0e0d0', casing: '#c0b0a0' },
      street: { fill: '#f0e0d0', casing: '#c0b0a0' },
    },
    rail: {
      train: { fill: '#707070', casing: '#404040' },
      metro: { fill: '#8060a0', casing: '#503070' },
    },
    ferry: { fill: '#4080c0' },
  },
  grid: { color: '#000000', opacity: 0.1, width: 1, dasharray: [2, 2] },
} as never;

const LAYER_OPTIONS = DEFAULT_LAYER_OPTIONS;
const PRESENTATION = {} as SvgExportSnapshot['request']['presentation'];

function snapshot(
  overrides: {
    pitch?: number;
    bearing?: number;
    width?: number;
    height?: number;
  } = {},
): SvgExportSnapshot {
  return createSvgExportSnapshot({
    snapshotId: 'snap-1',
    cityData: makeCityData(),
    style: STYLE,
    activeLayers: {
      terrain: false,
      basemap: false,
      roads: false,
      transit: false,
      buildings: false,
      forests: false,
      districts: false,
    },
    layerOptions: LAYER_OPTIONS,
    transitDimming: false,
    watermarkVisible: false,
    camera: {
      longitude: 0,
      latitude: 0,
      zoom: 12,
      bearing: overrides.bearing ?? 0,
      pitch: overrides.pitch ?? 0,
    },
    extent: { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640 },
    surface: { width: overrides.width ?? 800, height: overrides.height ?? 600 },
    request: {
      format: 'svg',
      area: 'viewport',
      background: 'white',
      fileName: 'testville',
      presentation: PRESENTATION,
    },
  });
}

/** A worker double that runs the real serialization driver in-process. */
function createFakeWorker(): {
  handle: Parameters<
    typeof makeExporter
  >[0]['createWorker'] extends () => infer H
    ? H
    : never;
  terminated: () => boolean;
} {
  let terminated = false;
  const pending: Array<(proceed: boolean) => void> = [];
  const handle = {
    postMessage(message: SvgWorkerCommand | SvgWorkerReply) {
      if (message.type === 'serialize') {
        void runSvgSerialization(message, {
          emit: (event) =>
            handle.onmessage?.({ data: event } as MessageEvent<SvgWorkerEvent>),
          awaitAck: () =>
            new Promise<boolean>((resolve) => {
              pending.push(resolve);
            }),
        });
        return;
      }
      const resolve = pending.shift();
      resolve?.(message.type === 'ack');
    },
    onmessage: null as ((event: MessageEvent<SvgWorkerEvent>) => void) | null,
    onerror: null as ((event: unknown) => void) | null,
    terminate() {
      terminated = true;
      // Release anything still parked so the driver unwinds, as a real
      // terminate() would by tearing the thread down.
      while (pending.length > 0) pending.shift()?.(false);
    },
  };
  return { handle, terminated: () => terminated } as never;
}

class RecordingSink implements SvgExportSink {
  readonly chunks: SvgTextChunk[] = [];
  readonly calls: string[] = [];
  failAppendAt: number | null = null;
  failFinish = false;

  async begin(metadata: ExportBeginMetadata): Promise<ExportSession> {
    this.calls.push(`begin:${metadata.mode}:${metadata.expectedTiles}`);
    return {
      sessionId: 'a'.repeat(32),
      mode: 'streaming-svg',
      maxChunkBytes: 64 * 1024 * 1024,
      maxInFlight: 1,
    };
  }

  async append(
    _session: ExportSession,
    chunk: SvgTextChunk,
  ): Promise<AppendAck> {
    if (this.failAppendAt === chunk.sequence) {
      throw new Error('sink refused the chunk');
    }
    this.chunks.push(chunk);
    this.calls.push(`append:${chunk.sequence}`);
    return {
      sessionId: 'a'.repeat(32),
      sequence: chunk.sequence,
      acceptedBytes: chunk.text.length,
      completedUnits: 1,
    };
  }

  async finish(): Promise<ExportReceipt> {
    this.calls.push('finish');
    if (this.failFinish) throw new Error('publish failed');
    return { filePath: '/downloads/testville.svg', folderPath: '/downloads' };
  }

  async cancel(): Promise<void> {
    this.calls.push('cancel');
  }
}

function makeExporter(options: {
  createWorker: () => never;
  sink: SvgExportSink;
  chunkTargetBytes?: number;
}) {
  // The real builder, injected as the composition root does — the port is
  // about *where the import lives*, not about faking the scene.
  return new SvgExporter({
    buildScene: buildCartographicScene,
    ...options,
  } as never);
}

let sink: RecordingSink;
beforeEach(() => {
  sink = new RecordingSink();
});

describe('SvgExporter capability gate', () => {
  it('rejects a tilted camera before opening a session', async () => {
    const exporter = makeExporter({
      createWorker: (() => {
        throw new Error('worker must never be created');
      }) as never,
      sink,
    });
    await expect(
      exporter.export(snapshot({ pitch: 45 })),
    ).rejects.toBeInstanceOf(SvgExportCapabilityError);
    expect(sink.calls).toEqual([]);
  });

  it('rejects a rotated camera rather than flattening it silently', async () => {
    const exporter = makeExporter({
      createWorker: (() => {
        throw new Error('worker must never be created');
      }) as never,
      sink,
    });
    await expect(
      exporter.export(snapshot({ bearing: 30 })),
    ).rejects.toMatchObject({ reason: 'camera-bearing' });
    expect(sink.calls).toEqual([]);
  });

  it('accepts floating-point noise around zero as top-down', () => {
    const exporter = makeExporter({
      createWorker: (() => null) as never,
      sink,
    });
    expect(
      exporter.capabilitiesForSnapshot(
        snapshot({ pitch: 1e-14, bearing: 360 }),
      ),
    ).toEqual({ eligible: true });
  });

  it('rejects a degenerate output surface', () => {
    const exporter = makeExporter({
      createWorker: (() => null) as never,
      sink,
    });
    expect(
      exporter.capabilitiesForSnapshot(snapshot({ width: 0 })),
    ).toMatchObject({ eligible: false, reason: 'dimensions' });
  });
});

describe('SvgExporter streaming', () => {
  it('publishes only after every chunk has been accepted', async () => {
    const fake = createFakeWorker();
    const exporter = makeExporter({
      createWorker: (() => fake.handle) as never,
      sink,
      chunkTargetBytes: 64,
    });

    const receipt = await exporter.export(snapshot());
    expect(receipt.filePath).toBe('/downloads/testville.svg');

    const appends = sink.calls.filter((call) => call.startsWith('append:'));
    expect(appends.length).toBeGreaterThan(0);
    // `finish` is the last call, and every append precedes it.
    expect(sink.calls[sink.calls.length - 1]).toBe('finish');
    expect(sink.calls[0]).toBe('begin:streaming-svg:0');
    expect(sink.chunks.map((chunk) => chunk.text).join('')).toMatch(
      /^<\?xml[\s\S]*<\/svg>$/,
    );
  });

  it('numbers chunks strictly increasing from zero', async () => {
    const fake = createFakeWorker();
    const exporter = makeExporter({
      createWorker: (() => fake.handle) as never,
      sink,
      chunkTargetBytes: 32,
    });
    await exporter.export(snapshot());
    expect(sink.chunks.map((chunk) => chunk.sequence)).toEqual(
      sink.chunks.map((_, index) => index),
    );
  });

  it('cancels the session and publishes nothing when the sink rejects a chunk', async () => {
    const fake = createFakeWorker();
    sink.failAppendAt = 0;
    const exporter = makeExporter({
      createWorker: (() => fake.handle) as never,
      sink,
      chunkTargetBytes: 64,
    });

    await expect(exporter.export(snapshot())).rejects.toThrow(
      'sink refused the chunk',
    );
    expect(sink.calls).toContain('cancel');
    expect(sink.calls).not.toContain('finish');
    expect(fake.terminated()).toBe(true);
  });

  it('cancels session and worker when the signal aborts mid-stream', async () => {
    const fake = createFakeWorker();
    const controller = new AbortController();
    const originalAppend = sink.append.bind(sink);
    sink.append = async (session, chunk) => {
      const ack = await originalAppend(session, chunk);
      controller.abort();
      return ack;
    };
    const exporter = makeExporter({
      createWorker: (() => fake.handle) as never,
      sink,
      chunkTargetBytes: 32,
    });

    await expect(
      exporter.export(snapshot(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(sink.calls).toContain('cancel');
    expect(sink.calls).not.toContain('finish');
    expect(fake.terminated()).toBe(true);
  });

  it('reports failure without a receipt when publication itself fails', async () => {
    const fake = createFakeWorker();
    sink.failFinish = true;
    const exporter = makeExporter({
      createWorker: (() => fake.handle) as never,
      sink,
      chunkTargetBytes: 64,
    });
    await expect(exporter.export(snapshot())).rejects.toThrow('publish failed');
    expect(sink.calls).toContain('cancel');
  });

  it('refuses a second concurrent export', async () => {
    const fake = createFakeWorker();
    const exporter = makeExporter({
      createWorker: (() => fake.handle) as never,
      sink,
      chunkTargetBytes: 64,
    });
    const first = exporter.export(snapshot());
    await expect(exporter.export(snapshot())).rejects.toThrow('already active');
    await first;
  });

  it('reports progress only for chunks Rust actually accepted', async () => {
    const fake = createFakeWorker();
    const progress = vi.fn();
    const exporter = makeExporter({
      createWorker: (() => fake.handle) as never,
      sink,
      chunkTargetBytes: 32,
    });
    await exporter.export(snapshot(), undefined, progress);

    expect(progress).toHaveBeenCalledTimes(sink.chunks.length);
    for (const [call] of progress.mock.calls) {
      expect(call.mode).toBe('streaming-svg');
      expect(call.snapshotId).toBe('snap-1');
      // No denominator is known while streaming, so no percentage is claimed.
      expect(call.percent).toBeUndefined();
    }
  });
});

import type {
  CapabilityReport,
  ExportSession,
  ExportSink,
  ExportSnapshot,
  ExportReceipt,
  RasterTileChunk,
  TilePlanTile,
} from '@vellum/core';
import { describe, expect, it, vi } from 'vitest';
import { TiledRasterExporter, type TileCapture } from './tiled-raster-exporter';

const capability: CapabilityReport = {
  contextType: 'webgl2',
  webgl2: true,
  maxTextureSize: 8192,
  maxRenderbufferSize: 8192,
  maxViewportDims: [8192, 8192],
  maxCanvasSize: 8192,
  toBlob: true,
  memoryAvailableBytes: 'unknown',
};

function snapshot(width: number, height: number): ExportSnapshot {
  return {
    snapshotId: 'tiled-exporter-test',
    cityData: {} as ExportSnapshot['cityData'],
    style: {} as ExportSnapshot['style'],
    activeLayers: {} as ExportSnapshot['activeLayers'],
    layerOptions: {} as ExportSnapshot['layerOptions'],
    transitDimming: false,
    watermarkVisible: false,
    camera: { longitude: 0, latitude: 0, zoom: 12, bearing: 0, pitch: 0 },
    extent: { minX: -1000, maxX: 1000, minZ: -500, maxZ: 500 },
    surface: { width, height },
    request: {
      format: 'png-1x',
      area: 'viewport',
      background: 'white',
      fileName: 'test',
      presentation: {} as ExportSnapshot['request']['presentation'],
    },
  };
}

function makeSession(mode: 'tiled-png' = 'tiled-png'): ExportSession {
  return {
    sessionId: 'session-test',
    mode,
    maxChunkBytes: 1024,
    maxInFlight: 1,
  };
}

function makeSink(overrides: Partial<ExportSink> = {}): ExportSink {
  return {
    begin: vi.fn().mockResolvedValue(makeSession()),
    append: vi.fn().mockResolvedValue({
      sessionId: 'session-test',
      sequence: 0,
      acceptedBytes: 4,
      completedUnits: 1,
    }),
    finish: vi.fn().mockResolvedValue({
      filePath: '/tmp/export.png',
      folderPath: '/tmp',
    } satisfies ExportReceipt),
    cancel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** A fake `TileCapture` that records call order and returns deterministic bytes per tile. */
function makeFakeRenderer(events: string[]): {
  createRenderer: () => TileCapture;
  disposeCount: () => number;
} {
  let disposeCount = 0;
  const createRenderer = (): TileCapture => ({
    configure: vi.fn(async () => {
      events.push('configure');
    }),
    captureTile: vi.fn(async (tile: TilePlanTile) => {
      events.push(`capture-${tile.sequence}`);
      return new Uint8Array([tile.sequence]);
    }),
    dispose: vi.fn(() => {
      disposeCount += 1;
      events.push('dispose');
    }),
  });
  return { createRenderer, disposeCount: () => disposeCount };
}

describe('TiledRasterExporter', () => {
  it('rejects without opening a session when the planner rejects the snapshot', async () => {
    const sink = makeSink();
    const exporter = new TiledRasterExporter(capability, () => {
      throw new Error('renderer must not be created');
    });

    await expect(
      exporter.export(
        snapshot(40_000, 40_000),
        sink,
        new AbortController().signal,
      ),
    ).rejects.toThrow('dimensions');

    expect(sink.begin).not.toHaveBeenCalled();
  });

  it('rejects without opening a session when PNG encoding is unavailable', async () => {
    const sink = makeSink();
    const exporter = new TiledRasterExporter({ ...capability, toBlob: false });

    await expect(
      exporter.export(snapshot(100, 100), sink, new AbortController().signal),
    ).rejects.toThrow('to-blob');

    expect(sink.begin).not.toHaveBeenCalled();
  });

  it('opens a session with begin metadata matching the plan, then captures every tile row-major with an ACK before each next render', async () => {
    const events: string[] = [];
    const { createRenderer, disposeCount } = makeFakeRenderer(events);
    const sink = makeSink({
      append: vi.fn(async (_session, chunk: RasterTileChunk) => {
        events.push(`ack-${chunk.sequence}`);
        return {
          sessionId: 'session-test',
          sequence: chunk.sequence,
          acceptedBytes: chunk.encodedPng.byteLength,
          completedUnits: 1,
        };
      }),
    });
    const exporter = new TiledRasterExporter(capability, createRenderer);

    await exporter.export(
      snapshot(4100, 2200),
      sink,
      new AbortController().signal,
    );

    expect(sink.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'tiled-png',
        outputWidth: 4100,
        outputHeight: 2200,
        expectedTiles: 6,
      }),
    );
    expect(events).toEqual([
      'configure',
      'capture-0',
      'ack-0',
      'capture-1',
      'ack-1',
      'capture-2',
      'ack-2',
      'capture-3',
      'ack-3',
      'capture-4',
      'ack-4',
      'capture-5',
      'ack-5',
      'dispose',
    ]);
    const appendedChunks = vi
      .mocked(sink.append)
      .mock.calls.map(([, chunk]) => chunk as RasterTileChunk);
    expect(appendedChunks.map((chunk) => chunk.sequence)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(appendedChunks[0]).toMatchObject({
      tileX: 0,
      tileY: 0,
      usefulRect: { x: 0, y: 0, width: 2048, height: 2048 },
    });
    expect(appendedChunks[0].renderRect).not.toEqual(
      appendedChunks[0].usefulRect,
    );
    expect(sink.finish).toHaveBeenCalledWith(makeSession());
    expect(disposeCount()).toBe(1);
  });

  it('cancels the session once if a capture fails and never attempts finish', async () => {
    const events: string[] = [];
    const failing: () => TileCapture = () => ({
      configure: vi.fn(async () => undefined),
      captureTile: vi.fn().mockRejectedValue(new Error('render failed')),
      dispose: vi.fn(() => {
        events.push('dispose');
      }),
    });
    const sink = makeSink();
    const exporter = new TiledRasterExporter(capability, failing);

    await expect(
      exporter.export(snapshot(100, 100), sink, new AbortController().signal),
    ).rejects.toThrow('render failed');

    expect(sink.cancel).toHaveBeenCalledOnce();
    expect(sink.cancel).toHaveBeenCalledWith(makeSession(), 'capture-failed');
    expect(sink.finish).not.toHaveBeenCalled();
    expect(events).toEqual(['dispose']);
  });

  it('cancels the session once if append fails and never attempts finish', async () => {
    const { createRenderer } = makeFakeRenderer([]);
    const sink = makeSink({
      append: vi.fn().mockRejectedValue(new Error('append failed')),
    });
    const exporter = new TiledRasterExporter(capability, createRenderer);

    await expect(
      exporter.export(snapshot(100, 100), sink, new AbortController().signal),
    ).rejects.toThrow('append failed');

    expect(sink.cancel).toHaveBeenCalledOnce();
    expect(sink.cancel).toHaveBeenCalledWith(makeSession(), 'sink-failed');
    expect(sink.finish).not.toHaveBeenCalled();
  });

  it('honours abort before reserving the tiled surface', async () => {
    const controller = new AbortController();
    controller.abort();
    const { createRenderer } = makeFakeRenderer([]);
    const sink = makeSink();
    const exporter = new TiledRasterExporter(capability, createRenderer);

    await expect(
      exporter.export(snapshot(100, 100), sink, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(sink.begin).not.toHaveBeenCalled();
  });

  it('aborts mid-loop, cancels once with reason aborted, and disposes the renderer', async () => {
    const controller = new AbortController();
    const events: string[] = [];
    const createRenderer = (): TileCapture => ({
      configure: vi.fn(async () => undefined),
      captureTile: vi.fn(async (tile: TilePlanTile) => {
        if (tile.sequence === 1) controller.abort();
        return new Uint8Array([tile.sequence]);
      }),
      dispose: vi.fn(() => {
        events.push('dispose');
      }),
    });
    const sink = makeSink();
    const exporter = new TiledRasterExporter(capability, createRenderer);

    await expect(
      exporter.export(snapshot(4100, 2200), sink, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(sink.cancel).toHaveBeenCalledOnce();
    expect(sink.cancel).toHaveBeenCalledWith(makeSession(), 'aborted');
    expect(sink.finish).not.toHaveBeenCalled();
    expect(events).toEqual(['dispose']);
  });

  it('never cancels a session that already started finishing', async () => {
    const { createRenderer } = makeFakeRenderer([]);
    const sink = makeSink({
      finish: vi.fn().mockRejectedValue(new Error('publish failed')),
    });
    const exporter = new TiledRasterExporter(capability, createRenderer);

    await expect(
      exporter.export(snapshot(100, 100), sink, new AbortController().signal),
    ).rejects.toThrow('publish failed');

    expect(sink.cancel).not.toHaveBeenCalled();
  });

  it('cancels proactively — not after waiting for it to settle — when abort() fires while sink.finish() is in flight', async () => {
    const { createRenderer } = makeFakeRenderer([]);
    let resolveFinish: ((receipt: ExportReceipt) => void) | undefined;
    let rejectFinish: ((reason?: unknown) => void) | undefined;
    const sink = makeSink({
      finish: vi.fn(
        () =>
          new Promise<ExportReceipt>((resolve, reject) => {
            resolveFinish = resolve;
            rejectFinish = reject;
          }),
      ),
    });
    const exporter = new TiledRasterExporter(capability, createRenderer);
    const controller = new AbortController();

    const exportPromise = exporter.export(
      snapshot(100, 100),
      sink,
      controller.signal,
    );

    // Let the export reach `sink.finish()` before aborting.
    await new Promise((r) => setTimeout(r, 0));
    expect(sink.finish).toHaveBeenCalledOnce();
    expect(sink.cancel).not.toHaveBeenCalled();

    controller.abort();
    // The cancel must fire immediately, without waiting for finish() to settle.
    expect(sink.cancel).toHaveBeenCalledWith(makeSession(), 'aborted');

    // Simulates Rust's own `cancel_requested` check rejecting the publish.
    rejectFinish?.(new Error('export session was cancelled while finishing'));

    await expect(exportPromise).rejects.toThrow(
      'export session was cancelled while finishing',
    );
    expect(sink.cancel).toHaveBeenCalledOnce();

    resolveFinish?.({ filePath: '/tmp/unused.png', folderPath: '/tmp' });
  });

  it('does not double-cancel if finish() still resolves successfully after an abort raced in', async () => {
    const { createRenderer } = makeFakeRenderer([]);
    let resolveFinish: ((receipt: ExportReceipt) => void) | undefined;
    const sink = makeSink({
      finish: vi.fn(
        () =>
          new Promise<ExportReceipt>((resolve) => {
            resolveFinish = resolve;
          }),
      ),
    });
    const exporter = new TiledRasterExporter(capability, createRenderer);
    const controller = new AbortController();

    const exportPromise = exporter.export(
      snapshot(100, 100),
      sink,
      controller.signal,
    );
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    expect(sink.cancel).toHaveBeenCalledOnce();

    // Rust wins the race and commits anyway (a legitimate photo-finish).
    resolveFinish?.({ filePath: '/tmp/export.png', folderPath: '/tmp' });
    await expect(exportPromise).resolves.toBeUndefined();
    expect(sink.cancel).toHaveBeenCalledOnce();
  });

  it('reports monotonic, phase-tagged progress that only advances after each AppendAck', async () => {
    const { createRenderer } = makeFakeRenderer([]);
    // Real Rust always reports `completed_units: 1` per ack (never a running
    // total, per `session.rs`) — the exporter itself must accumulate it.
    const sink = makeSink({
      append: vi.fn(async (_session, chunk: RasterTileChunk) => ({
        sessionId: 'session-test',
        sequence: chunk.sequence,
        acceptedBytes: chunk.encodedPng.byteLength,
        completedUnits: 1,
      })),
    });
    const exporter = new TiledRasterExporter(capability, createRenderer);
    const onProgress = vi.fn();

    await exporter.export(
      snapshot(4100, 2200),
      sink,
      new AbortController().signal,
      onProgress,
    );

    const events = onProgress.mock.calls.map(([progress]) => progress);
    expect(events[0]).toMatchObject({
      phase: 'capturing',
      completedUnits: 0,
      totalUnits: 6,
      percent: 0,
    });
    expect(events.at(-1)).toMatchObject({
      phase: 'finishing',
      completedUnits: 6,
      totalUnits: 6,
      percent: 100,
    });
    const percentages = events.map((e) => e.percent as number);
    for (let i = 1; i < percentages.length; i += 1) {
      expect(percentages[i]).toBeGreaterThanOrEqual(percentages[i - 1]);
    }
    // Every event must carry the identity needed to discard stale callbacks.
    for (const event of events) {
      expect(event.snapshotId).toBe('tiled-exporter-test');
      expect(event.sessionId).toBe('session-test');
      expect(event.mode).toBe('tiled-png');
    }
  });

  it('accumulates completedUnits across tiles instead of resetting to the last ack (regression)', async () => {
    const { createRenderer } = makeFakeRenderer([]);
    // `completed_units: 1` on every single ack, exactly as Rust really sends it.
    const sink = makeSink({
      append: vi.fn().mockResolvedValue({
        sessionId: 'session-test',
        sequence: 0,
        acceptedBytes: 4,
        completedUnits: 1,
      }),
    });
    const exporter = new TiledRasterExporter(capability, createRenderer);
    const onProgress = vi.fn();

    await exporter.export(
      snapshot(4100, 2200),
      sink,
      new AbortController().signal,
      onProgress,
    );

    const completedByComposingEvent = onProgress.mock.calls
      .map(([progress]) => progress)
      .filter((progress) => progress.phase === 'composing')
      .map((progress) => progress.completedUnits);
    expect(completedByComposingEvent).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('clamps accumulated progress at totalUnits even if an ack over-reports', async () => {
    const { createRenderer } = makeFakeRenderer([]);
    const sink = makeSink({
      // A misbehaving/duplicate ack claims more units than remain.
      append: vi.fn().mockResolvedValue({
        sessionId: 'session-test',
        sequence: 0,
        acceptedBytes: 4,
        completedUnits: 5,
      }),
    });
    const exporter = new TiledRasterExporter(capability, createRenderer);
    const onProgress = vi.fn();

    await exporter.export(
      snapshot(4100, 2200),
      sink,
      new AbortController().signal,
      onProgress,
    );

    const completedByComposingEvent = onProgress.mock.calls
      .map(([progress]) => progress)
      .filter((progress) => progress.phase === 'composing')
      .map((progress) => progress.completedUnits);
    for (const completed of completedByComposingEvent) {
      expect(completed).toBeLessThanOrEqual(6);
    }
    expect(completedByComposingEvent.at(-1)).toBe(6);
  });

  it('never reports progress for the legacy-style caller when onProgress is omitted', async () => {
    const { createRenderer } = makeFakeRenderer([]);
    const sink = makeSink();
    const exporter = new TiledRasterExporter(capability, createRenderer);

    await expect(
      exporter.export(snapshot(100, 100), sink, new AbortController().signal),
    ).resolves.toBeUndefined();
  });
});

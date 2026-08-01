import type {
  ExportBeginMetadata,
  ExportRequest,
  RasterTileChunk,
} from '@vellum/core';
import { describe, expect, it, vi } from 'vitest';
import { LegacyExportSink } from './legacy-export-sink';

const request = {
  format: 'png-2x',
  area: 'viewport',
  background: 'transparent',
  fileName: 'my-map',
  presentation: {} as ExportRequest['presentation'],
} satisfies ExportRequest;

const metadata = {
  mode: 'legacy-png',
  snapshotId: 'snapshot-test',
  request,
  outputWidth: 800,
  outputHeight: 600,
  expectedTiles: 1,
} satisfies ExportBeginMetadata;

const chunk: RasterTileChunk = {
  sequence: 0,
  tileX: 0,
  tileY: 0,
  usefulRect: { x: 0, y: 0, width: 800, height: 600 },
  renderRect: { x: 0, y: 0, width: 800, height: 600 },
  encodedPng: new Uint8Array([137, 80, 78, 71]),
};

describe('LegacyExportSink', () => {
  it('mantiene el payload legacy y convierte bytes sólo en finish', async () => {
    const invoke =
      vi.fn<
        (command: string, args: Record<string, unknown>) => Promise<unknown>
      >();
    invoke.mockResolvedValue({
      filePath: '/tmp/my-map.png',
      folderPath: '/tmp',
    });
    const sink = new LegacyExportSink(invoke);
    const session = await sink.begin(metadata);

    await sink.append(session, chunk);
    await expect(sink.finish(session)).resolves.toEqual({
      filePath: '/tmp/my-map.png',
      folderPath: '/tmp',
    });

    expect(invoke).toHaveBeenCalledWith('export_png', {
      options: {
        format: 'png-2x',
        area: 'viewport',
        background: 'transparent',
        fileName: 'my-map',
        pngBytes: [137, 80, 78, 71],
      },
    });
  });

  it('reenvía targetLongEdge en el payload para un request full-map', async () => {
    const fullMapRequest = {
      format: 'png-1x',
      area: 'full-map',
      targetLongEdge: 12000,
      background: 'transparent',
      fileName: 'my-map',
      presentation: {} as ExportRequest['presentation'],
    } satisfies ExportRequest;
    const fullMapMetadata = {
      ...metadata,
      request: fullMapRequest,
    } satisfies ExportBeginMetadata;
    const invoke =
      vi.fn<
        (command: string, args: Record<string, unknown>) => Promise<unknown>
      >();
    invoke.mockResolvedValue({
      filePath: '/tmp/my-map.png',
      folderPath: '/tmp',
    });
    const sink = new LegacyExportSink(invoke);
    const session = await sink.begin(fullMapMetadata);

    await sink.append(session, chunk);
    await sink.finish(session);

    expect(invoke).toHaveBeenCalledWith('export_png', {
      options: {
        format: 'png-1x',
        area: 'full-map',
        targetLongEdge: 12000,
        background: 'transparent',
        fileName: 'my-map',
        pngBytes: [137, 80, 78, 71],
      },
    });
  });

  it('rechaza un segundo append o un chunk que no cubre la salida completa', async () => {
    const sink = new LegacyExportSink(vi.fn());
    const session = await sink.begin(metadata);

    await sink.append(session, chunk);
    await expect(sink.append(session, chunk)).rejects.toThrow(
      'exactly one complete',
    );
    await expect(
      sink.append(session, { ...chunk, sequence: 1 }),
    ).rejects.toThrow('exactly one complete');
  });

  it('cancela una sesión en memoria sin invocar Tauri', async () => {
    const invoke =
      vi.fn<
        (command: string, args: Record<string, unknown>) => Promise<unknown>
      >();
    const sink = new LegacyExportSink(invoke);
    const session = await sink.begin(metadata);

    await expect(sink.cancel(session, 'aborted')).resolves.toBeUndefined();
    await expect(sink.cancel(session, 'aborted')).resolves.toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rechaza el modo tiled en esta transición legacy-only', async () => {
    const sink = new LegacyExportSink(vi.fn());

    await expect(
      sink.begin({ ...metadata, mode: 'tiled-png' }),
    ).rejects.toThrow('legacy-png');
  });
});

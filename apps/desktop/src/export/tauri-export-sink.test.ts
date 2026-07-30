import type {
  ExportBeginMetadata,
  ExportRequest,
  RasterTileChunk,
} from '@vellum/core';
import { describe, expect, it, vi } from 'vitest';
import { TauriExportSink } from './tauri-export-sink';

const SESSION_ID = '11223344556677881122334455667788';

const request = {
  format: 'png-4x',
  area: 'full-map',
  background: 'white',
  fileName: 'big-map',
  presentation: {} as ExportRequest['presentation'],
} satisfies ExportRequest;

const metadata = {
  mode: 'tiled-png',
  snapshotId: 'snapshot-test',
  request,
  outputWidth: 4000,
  outputHeight: 3000,
  expectedTiles: 2,
} satisfies ExportBeginMetadata;

const sessionResponse = {
  sessionId: SESSION_ID,
  mode: 'tiled-png',
  maxChunkBytes: 64 * 1024 * 1024,
  maxInFlight: 1,
};

function chunk(sequence: number): RasterTileChunk {
  return {
    sequence,
    tileX: sequence,
    tileY: 0,
    usefulRect: { x: 0, y: 0, width: 100, height: 100 },
    renderRect: { x: 0, y: 0, width: 110, height: 110 },
    encodedPng: new Uint8Array([1, 2, 3]),
  };
}

function ackFor(seq: number) {
  return {
    sessionId: SESSION_ID,
    sequence: seq,
    acceptedBytes: 3,
    completedUnits: 1,
  };
}

describe('TauriExportSink', () => {
  it('completa el ciclo begin/append/finish con frames binarios crudos', async () => {
    const invoke = vi.fn<(command: string, args: unknown) => Promise<unknown>>(
      async (command) => {
        if (command === 'begin_export') return sessionResponse;
        if (command === 'append_export_chunk') return ackFor(0);
        if (command === 'finish_export')
          return { filePath: '/tmp/big-map.png', folderPath: '/tmp' };
        throw new Error(`unexpected command: ${command}`);
      },
    );
    const sink = new TauriExportSink(invoke);

    const session = await sink.begin(metadata);
    expect(invoke).toHaveBeenCalledWith('begin_export', { metadata });

    await sink.append(session, chunk(0));
    const [, appendArgs] = invoke.mock.calls[1];
    expect(appendArgs).toBeInstanceOf(Uint8Array);
    expect(Array.isArray(appendArgs)).toBe(false);

    await expect(sink.finish(session)).resolves.toEqual({
      filePath: '/tmp/big-map.png',
      folderPath: '/tmp',
    });
    expect(invoke).toHaveBeenCalledWith('finish_export', {
      sessionId: SESSION_ID,
    });
  });

  it('rechaza el modo legacy-png', async () => {
    const sink = new TauriExportSink(vi.fn());
    await expect(
      sink.begin({ ...metadata, mode: 'legacy-png' }),
    ).rejects.toThrow('tiled-png');
  });

  it('bloquea un segundo append mientras el primero está en vuelo', async () => {
    let resolveAppend: (value: unknown) => void = () => {};
    const invoke = vi.fn(async (command: string) => {
      if (command === 'begin_export') return sessionResponse;
      if (command === 'append_export_chunk') {
        return new Promise((resolve) => {
          resolveAppend = resolve;
        });
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const sink = new TauriExportSink(invoke);
    const session = await sink.begin(metadata);

    const firstAppend = sink.append(session, chunk(0));
    await expect(sink.append(session, chunk(1))).rejects.toThrow('maxInFlight');

    resolveAppend(ackFor(0));
    await expect(firstAppend).resolves.toEqual(ackFor(0));
  });

  it('rechaza una secuencia fuera de orden', async () => {
    const invoke = vi.fn(async (command: string) =>
      command === 'begin_export' ? sessionResponse : ackFor(1),
    );
    const sink = new TauriExportSink(invoke);
    const session = await sink.begin(metadata);

    await expect(sink.append(session, chunk(1))).rejects.toThrow(
      'expected sequence 0',
    );
  });

  it('rechaza un ack que no corresponde a la sesión o secuencia enviada', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'begin_export') return sessionResponse;
      if (command === 'append_export_chunk') return ackFor(99);
      throw new Error(`unexpected command: ${command}`);
    });
    const sink = new TauriExportSink(invoke);
    const session = await sink.begin(metadata);

    await expect(sink.append(session, chunk(0))).rejects.toThrow(
      'different session or sequence',
    );
  });

  it('permite finish una sola vez', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'begin_export') return sessionResponse;
      if (command === 'finish_export')
        return { filePath: '/tmp/big-map.png', folderPath: '/tmp' };
      throw new Error(`unexpected command: ${command}`);
    });
    const sink = new TauriExportSink(invoke);
    const session = await sink.begin(metadata);

    await sink.finish(session);
    await expect(sink.finish(session)).rejects.toThrow('no longer active');
  });

  it('cancel es idempotente y siempre invoca cancel_export en Rust', async () => {
    const invoke = vi.fn(async (command: string) =>
      command === 'begin_export' ? sessionResponse : undefined,
    );
    const sink = new TauriExportSink(invoke);
    const session = await sink.begin(metadata);

    await sink.cancel(session, 'aborted');
    await sink.cancel(session, 'aborted');

    expect(invoke).toHaveBeenCalledWith('cancel_export', {
      sessionId: SESSION_ID,
    });
    expect(
      invoke.mock.calls.filter(([command]) => command === 'cancel_export'),
    ).toHaveLength(2);
  });

  it('rechaza una respuesta de sesión malformada (type guard)', async () => {
    const invoke = vi.fn(async () => ({ sessionId: SESSION_ID }));
    const sink = new TauriExportSink(invoke);
    await expect(sink.begin(metadata)).rejects.toThrow('invalid session');
  });
});

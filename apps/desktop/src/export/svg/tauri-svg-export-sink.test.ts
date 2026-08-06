import { describe, expect, it, vi } from 'vitest';
import type { ExportBeginMetadata, ExportSession } from '@vellum/core';
import {
  decodeExportFrame,
  EXPORT_FRAME_KIND_SVG_CHUNK,
} from '../export-frame';
import { TauriSvgExportSink } from './tauri-svg-export-sink';

const SESSION_ID = 'b'.repeat(32);

const metadata: ExportBeginMetadata = {
  mode: 'streaming-svg',
  snapshotId: 'snap-1',
  request: {
    format: 'svg',
    area: 'viewport',
    background: 'white',
    fileName: 'map',
    presentation: {} as ExportBeginMetadata['request']['presentation'],
  },
  outputWidth: 800,
  outputHeight: 600,
  expectedTiles: 0,
};

function fakeInvoke(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (command: string, _args: unknown) => {
    if (command === 'begin_export') {
      return (
        overrides.begin ?? {
          sessionId: SESSION_ID,
          mode: 'streaming-svg',
          maxChunkBytes: 64 * 1024 * 1024,
          maxInFlight: 1,
        }
      );
    }
    if (command === 'append_export_chunk') {
      return (
        overrides.append ?? {
          sessionId: SESSION_ID,
          sequence: 0,
          acceptedBytes: 6,
          completedUnits: 1,
        }
      );
    }
    if (command === 'finish_export') {
      return { filePath: '/d/map.svg', folderPath: '/d' };
    }
    return undefined;
  });
}

describe('TauriSvgExportSink', () => {
  it('refuses a session that is not streaming-svg', async () => {
    const sink = new TauriSvgExportSink(fakeInvoke());
    await expect(
      sink.begin({ ...metadata, mode: 'tiled-png' }),
    ).rejects.toThrow('streaming-svg');
  });

  it('rejects a session whose reported mode does not match the request', async () => {
    const sink = new TauriSvgExportSink(
      fakeInvoke({
        begin: {
          sessionId: SESSION_ID,
          mode: 'tiled-png',
          maxChunkBytes: 1024,
          maxInFlight: 1,
        },
      }),
    );
    await expect(sink.begin(metadata)).rejects.toThrow('invalid session');
  });

  it('sends each chunk as a raw svg-kind binary frame', async () => {
    const invoke = fakeInvoke();
    const sink = new TauriSvgExportSink(invoke);
    const session = await sink.begin(metadata);

    await sink.append(session, { sequence: 0, text: '<svg/>' });

    const [command, frame] = invoke.mock.calls[1]!;
    expect(command).toBe('append_export_chunk');
    expect(frame).toBeInstanceOf(Uint8Array);
    const decoded = decodeExportFrame(frame as Uint8Array);
    expect(decoded.kind).toBe(EXPORT_FRAME_KIND_SVG_CHUNK);
    expect(decoded.sessionId).toBe(SESSION_ID);
    expect(new TextDecoder().decode(decoded.encodedPng)).toBe('<svg/>');
  });

  it('enforces strictly increasing sequences', async () => {
    const sink = new TauriSvgExportSink(fakeInvoke());
    const session = await sink.begin(metadata);
    await expect(
      sink.append(session, { sequence: 1, text: '<svg/>' }),
    ).rejects.toThrow('expected sequence 0');
  });

  it('rejects an ack that belongs to another sequence', async () => {
    const sink = new TauriSvgExportSink(
      fakeInvoke({
        append: {
          sessionId: SESSION_ID,
          sequence: 7,
          acceptedBytes: 6,
          completedUnits: 1,
        },
      }),
    );
    const session = await sink.begin(metadata);
    await expect(
      sink.append(session, { sequence: 0, text: '<svg/>' }),
    ).rejects.toThrow('different session or sequence');
  });

  it('cancels the Rust session when publication fails, leaving no orphan', async () => {
    const invoke = vi.fn(async (command: string, _args: unknown) => {
      if (command === 'begin_export') {
        return {
          sessionId: SESSION_ID,
          mode: 'streaming-svg',
          maxChunkBytes: 1024,
          maxInFlight: 1,
        };
      }
      if (command === 'finish_export') throw new Error('rename failed');
      return undefined;
    });
    const sink = new TauriSvgExportSink(invoke);
    const session = await sink.begin(metadata);

    await expect(sink.finish(session)).rejects.toThrow('rename failed');
    expect(invoke.mock.calls.map(([command]) => command)).toContain(
      'cancel_export',
    );
  });

  it('refuses to operate on a session it no longer owns', async () => {
    const sink = new TauriSvgExportSink(fakeInvoke());
    const stranger: ExportSession = {
      sessionId: 'c'.repeat(32),
      mode: 'streaming-svg',
      maxChunkBytes: 1024,
      maxInFlight: 1,
    };
    await expect(
      sink.append(stranger, { sequence: 0, text: '<svg/>' }),
    ).rejects.toThrow('no longer active');
  });
});

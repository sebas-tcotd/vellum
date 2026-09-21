import { describe, expect, it, vi } from 'vitest';
import { makeCityData } from '@vellum/core/testing';
import { WorkerSchematicLayoutClient } from './schematic-layout-client';
import type { SchematicLayoutWorker } from './schematic-layout-client';

describe('WorkerSchematicLayoutClient', () => {
  it('terminates cancellation and ignores a late response', () => {
    let worker!: SchematicLayoutWorker;
    const terminate = vi.fn();
    const client = new WorkerSchematicLayoutClient(() => {
      worker = {
        postMessage: vi.fn(),
        onmessage: null,
        onerror: null,
        terminate,
      };
      return worker;
    });
    const receive = vi.fn();
    const cancel = client.request(makeCityData(), 'octilinear', receive);
    const request = (worker.postMessage as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    cancel();
    worker.onmessage?.({
      data: { type: 'error', requestId: request.requestId, reason: 'late' },
    } as MessageEvent);
    expect(terminate).toHaveBeenCalledOnce();
    expect(receive).not.toHaveBeenCalled();
  });

  it.each(['complete', 'error'] as const)(
    'cleans up and terminates on %s',
    (type) => {
      let worker!: SchematicLayoutWorker;
      const terminate = vi.fn();
      const client = new WorkerSchematicLayoutClient(
        () =>
          (worker = {
            postMessage: vi.fn(),
            onmessage: null,
            onerror: null,
            terminate,
          }),
      );
      const receive = vi.fn();
      client.request(makeCityData(), 'geographic', receive);
      const request = (worker.postMessage as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      worker.onmessage?.({
        data:
          type === 'complete'
            ? { type, requestId: request.requestId, layout: {}, lines: [] }
            : { type, requestId: request.requestId, reason: 'nope' },
      } as MessageEvent);
      expect(receive).toHaveBeenCalledOnce();
      expect(worker.onmessage).toBeNull();
      expect(worker.onerror).toBeNull();
      expect(terminate).toHaveBeenCalledOnce();
    },
  );
});

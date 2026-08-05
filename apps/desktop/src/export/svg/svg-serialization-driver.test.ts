import { describe, expect, it } from 'vitest';
import type { CartographicScene } from '@vellum/core';
import { runSvgSerialization } from './svg-serialization-driver';
import type { SvgWorkerEvent } from './svg-worker-protocol';

const SCENE: CartographicScene = {
  projection: {
    extent: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    width: 100,
    height: 100,
  },
  background: '#ffffff',
  gradients: [],
  layers: [
    {
      id: 'roads',
      visible: true,
      entities: Array.from({ length: 50 }, (_, index) => ({
        id: `road-${index}`,
        geometry: {
          kind: 'path' as const,
          points: [
            { x: -10, z: index },
            { x: 10, z: index },
          ],
        },
        stroke: { color: '#333333', widthPx: 6 },
      })),
    },
  ],
  warnings: [{ code: 'degenerate-geometry', count: 3 }],
};

/** Collects events, answering every ack request according to `acks`. */
async function drive(
  acks: (sequence: number) => boolean,
  chunkTargetBytes = 64,
): Promise<SvgWorkerEvent[]> {
  const events: SvgWorkerEvent[] = [];
  await runSvgSerialization(
    {
      type: 'serialize',
      snapshotId: 'snap-1',
      scene: SCENE,
      chunkTargetBytes,
    },
    {
      emit: (event) => events.push(event),
      awaitAck: (sequence) => Promise.resolve(acks(sequence)),
    },
  );
  return events;
}

describe('runSvgSerialization', () => {
  it('emits chunks in order and finishes with ready-to-commit', async () => {
    const events = await drive(() => true);
    const chunks = events.filter((event) => event.type === 'chunk');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.sequence)).toEqual(
      chunks.map((_, index) => index),
    );

    const last = events[events.length - 1]!;
    expect(last.type).toBe('ready-to-commit');
    expect(last).toMatchObject({
      totalChunks: chunks.length,
      warnings: [{ code: 'degenerate-geometry', count: 3 }],
    });
  });

  it('waits for an acknowledgement before emitting the next chunk', async () => {
    const order: string[] = [];
    await runSvgSerialization(
      {
        type: 'serialize',
        snapshotId: 'snap-1',
        scene: SCENE,
        chunkTargetBytes: 64,
      },
      {
        emit: (event) => order.push(event.type),
        awaitAck: () => {
          order.push('ack');
          return Promise.resolve(true);
        },
      },
    );
    // Never two chunks in a row: maxInFlight = 1 holds inside the worker, not
    // only at the IPC edge.
    for (let i = 1; i < order.length; i += 1) {
      if (order[i] === 'chunk') expect(order[i - 1]).toBe('ack');
    }
  });

  it('stops mid-document and reports cancellation when an ack is refused', async () => {
    const events = await drive((sequence) => sequence < 1);
    const chunks = events.filter((event) => event.type === 'chunk');
    expect(chunks).toHaveLength(2);
    expect(events[events.length - 1]!.type).toBe('cancelled');
    // Nothing may claim the document is publishable once it was abandoned.
    expect(events.some((event) => event.type === 'ready-to-commit')).toBe(
      false,
    );
  });

  it('reports a serialization failure instead of throwing into the worker', async () => {
    const events: SvgWorkerEvent[] = [];
    await runSvgSerialization(
      {
        type: 'serialize',
        snapshotId: 'snap-1',
        scene: SCENE,
        chunkTargetBytes: 64,
      },
      {
        emit: (event) => events.push(event),
        awaitAck: () => Promise.reject(new Error('transport died')),
      },
    );
    expect(events[events.length - 1]).toMatchObject({
      type: 'error',
      snapshotId: 'snap-1',
      reason: 'transport died',
    });
  });

  it('tags every event with the snapshot it belongs to', async () => {
    const events = await drive(() => true);
    expect(events.every((event) => event.snapshotId === 'snap-1')).toBe(true);
  });
});

/// <reference lib="webworker" />
import {
  deriveTransitNetwork,
  geographicSchematicLayout,
  octilinearSchematicLayout,
  orthoradialSchematicLayout,
} from '@vellum/core';
import type {
  SchematicLayoutCommand,
  SchematicLayoutEvent,
  SchematicLayoutKind,
} from './schematic-layout-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let activeRequestId: string | null = null;

const strategies = {
  geographic: geographicSchematicLayout,
  octilinear: octilinearSchematicLayout,
  orthoradial: orthoradialSchematicLayout,
} satisfies Record<SchematicLayoutKind, typeof geographicSchematicLayout>;

function emit(event: SchematicLayoutEvent): void {
  scope.postMessage(event);
}

scope.onmessage = (event: MessageEvent<SchematicLayoutCommand>) => {
  const command = event.data;
  if (command.type === 'cancel') {
    // The client terminates us for a real cancellation. This branch only makes
    // a queued command harmless before that termination reaches the worker.
    if (command.requestId === activeRequestId) activeRequestId = null;
    return;
  }
  if (activeRequestId !== null) return;
  activeRequestId = command.requestId;
  try {
    emit({
      type: 'progress',
      requestId: command.requestId,
      phase: 'deriving',
      completed: 0,
      total: 2,
    });
    const network = deriveTransitNetwork(command.cityData);
    if (activeRequestId !== command.requestId) return;
    emit({
      type: 'progress',
      requestId: command.requestId,
      phase: 'laying-out',
      completed: 1,
      total: 2,
    });
    const layout = strategies[command.layout](network);
    if (activeRequestId === command.requestId) {
      const colors = new Map<string, string>();
      for (const segment of layout.segments)
        if (!colors.has(segment.lineId))
          colors.set(segment.lineId, segment.color);
      const lines = [...colors].flatMap(([lineId, color]) => {
        const line = network.lines.get(lineId);
        if (!line) return [];
        const name = line.name.trim();
        return [{ lineId, color, mode: line.mode, name: name || null }];
      });
      emit({ type: 'complete', requestId: command.requestId, layout, lines });
    }
  } catch (error: unknown) {
    if (activeRequestId === command.requestId) {
      emit({
        type: 'error',
        requestId: command.requestId,
        reason: String(error),
      });
    }
  } finally {
    if (activeRequestId === command.requestId) activeRequestId = null;
  }
};

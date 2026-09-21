import type {
  SchematicLayoutCommand,
  SchematicLayoutEvent,
  SchematicLayoutKind,
} from './schematic-layout-protocol';
import { SCHEMATIC_LAYOUT_PROTOCOL_VERSION } from './schematic-layout-protocol';
import type { CityData } from '@vellum/core';

export interface SchematicLayoutWorker {
  postMessage(message: SchematicLayoutCommand): void;
  onmessage: ((event: MessageEvent<SchematicLayoutEvent>) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror?: ((event: unknown) => void) | null;
  terminate(): void;
}

export interface SchematicLayoutClient {
  request(
    cityData: CityData,
    layout: SchematicLayoutKind,
    onEvent: (event: SchematicLayoutEvent) => void,
  ): () => void;
}

/** Fresh worker per request makes cancellation immediate and stale-proof. */
export class WorkerSchematicLayoutClient implements SchematicLayoutClient {
  constructor(private readonly createWorker: () => SchematicLayoutWorker) {}

  request(
    cityData: CityData,
    layout: SchematicLayoutKind,
    onEvent: (event: SchematicLayoutEvent) => void,
  ): () => void {
    const requestId = crypto.randomUUID();
    const worker = this.createWorker();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      worker.onmessage = null;
      worker.onerror = null;
      if ('onmessageerror' in worker) worker.onmessageerror = null;
      worker.terminate();
    };
    worker.onmessage = (message) => {
      if (closed || message.data.requestId !== requestId) return;
      onEvent(message.data);
      if (message.data.type === 'complete' || message.data.type === 'error')
        close();
    };
    worker.onerror = (error) => {
      if (!closed) {
        onEvent({ type: 'error', requestId, reason: String(error) });
        close();
      }
    };
    worker.onmessageerror = worker.onerror;
    worker.postMessage({
      type: 'layout',
      version: SCHEMATIC_LAYOUT_PROTOCOL_VERSION,
      requestId,
      cityData,
      layout,
    });
    return () => {
      if (closed) return;
      worker.postMessage({ type: 'cancel', requestId });
      close();
    };
  }
}

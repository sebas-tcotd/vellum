import { describe, expect, it, vi } from 'vitest';
import {
  createPlatformServices,
  type DragDropEventPayload,
  type PlatformServicesDeps,
  type ShellEventMessage,
} from './platform-services';

/**
 * Construye las dependencias con spies y expone los handlers que el adapter
 * registró, para poder disparar eventos como lo haría el bus de Tauri.
 *
 * @returns Los spies, los handlers capturados y el adapter ya ensamblado.
 */
function harness() {
  const unsubscribe = vi.fn();
  let eventHandler: ((message: ShellEventMessage<unknown>) => void) | null =
    null;
  let dragDropHandler:
    | ((event: ShellEventMessage<DragDropEventPayload>) => void)
    | null = null;

  const invoke = vi.fn(
    (_command: string, _args?: Record<string, unknown>): Promise<unknown> =>
      Promise.resolve('resultado'),
  );
  const listen = vi.fn(
    (
      _event: string,
      handler: (message: ShellEventMessage<unknown>) => void,
    ): Promise<() => void> => {
      eventHandler = handler;
      return Promise.resolve(unsubscribe);
    },
  );
  const openUrl = vi.fn((_url: string): Promise<void> => Promise.resolve());
  const onDragDropEvent = vi.fn(
    (
      handler: (event: ShellEventMessage<DragDropEventPayload>) => void,
    ): Promise<() => void> => {
      dragDropHandler = handler;
      return Promise.resolve(unsubscribe);
    },
  );

  // Los dos miembros genéricos del puerto se adaptan aquí, en un punto único,
  // en lugar de castear el objeto entero: así el doble sigue comprobado contra
  // `PlatformServicesDeps` y no puede desincronizarse en silencio.
  const deps: PlatformServicesDeps = {
    invoke: <T>(command: string, args?: Record<string, unknown>): Promise<T> =>
      invoke(command, args) as Promise<T>,
    listen: <T>(
      event: string,
      handler: (message: ShellEventMessage<T>) => void,
    ) =>
      listen(event, handler as (message: ShellEventMessage<unknown>) => void),
    openUrl,
    onDragDropEvent,
  };

  return {
    invoke,
    listen,
    openUrl,
    onDragDropEvent,
    unsubscribe,
    services: createPlatformServices(deps),
    emitEvent: (message: ShellEventMessage<unknown>) => eventHandler?.(message),
    emitDragDrop: (payload: DragDropEventPayload) =>
      dragDropHandler?.({ payload }),
  };
}

describe('createPlatformServices — subscribeEvent', () => {
  it('entrega el payload desempaquetado, no el sobre del evento', async () => {
    const h = harness();
    const received = vi.fn();

    await h.services.subscribeEvent<{ percent: number }>(
      'vellum://progress',
      received,
    );
    h.emitEvent({ payload: { percent: 42 } });

    expect(h.listen).toHaveBeenCalledWith(
      'vellum://progress',
      expect.any(Function),
    );
    expect(received).toHaveBeenCalledWith({ percent: 42 });
    // Un fallo silencioso aquí sería entregar `{ payload: { percent: 42 } }`.
    expect(received).not.toHaveBeenCalledWith({ payload: { percent: 42 } });
  });

  it('propaga la función de baja que devuelve listen()', async () => {
    const h = harness();
    const unsubscribe = await h.services.subscribeEvent('vellum://x', vi.fn());
    expect(unsubscribe).toBe(h.unsubscribe);
  });
});

describe('createPlatformServices — subscribeFileDrop', () => {
  it('no entrega las fases enter/over/leave del drag', async () => {
    const h = harness();
    const dropped = vi.fn();

    await h.services.subscribeFileDrop(dropped);
    h.emitDragDrop({ type: 'enter' });
    h.emitDragDrop({ type: 'over' });
    h.emitDragDrop({ type: 'leave' });

    expect(dropped).not.toHaveBeenCalled();
  });

  it('entrega las rutas de payload.paths sólo en la fase drop', async () => {
    const h = harness();
    const dropped = vi.fn();

    await h.services.subscribeFileDrop(dropped);
    h.emitDragDrop({ type: 'over' });
    h.emitDragDrop({ type: 'drop', paths: ['/tmp/altavento.cslmap'] });

    expect(dropped).toHaveBeenCalledTimes(1);
    expect(dropped).toHaveBeenCalledWith(['/tmp/altavento.cslmap']);
  });

  it('entrega todas las rutas soltadas: filtrarlas es política de la UI', async () => {
    const h = harness();
    const dropped = vi.fn();

    await h.services.subscribeFileDrop(dropped);
    h.emitDragDrop({
      type: 'drop',
      paths: ['/tmp/notas.txt', '/tmp/ciudad.cslmap'],
    });

    expect(dropped).toHaveBeenCalledWith([
      '/tmp/notas.txt',
      '/tmp/ciudad.cslmap',
    ]);
  });
});

describe('createPlatformServices — invoke y openExternalUrl', () => {
  it('delega invoke con comando y argumentos', async () => {
    const h = harness();
    await expect(
      h.services.invoke<string>('get_pending_update', { force: true }),
    ).resolves.toBe('resultado');
    expect(h.invoke).toHaveBeenCalledWith('get_pending_update', {
      force: true,
    });
  });

  it('delega openExternalUrl', async () => {
    const h = harness();
    await h.services.openExternalUrl('https://example.com');
    expect(h.openUrl).toHaveBeenCalledWith('https://example.com');
  });
});

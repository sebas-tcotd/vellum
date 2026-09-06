// packages/ui/src/testing/test-platform-services.tsx
// Test double for the shell adapter. Use it instead of mocking `@tauri-apps/*`:
// `@vellum/ui` has no such dependency any more (ADR-0001), so a module mock
// would assert against something the package never calls.
//
// Vive en `src/testing/` y no en `src/`: importa `vitest`, que es una
// devDependency, y `packages/ui/tsconfig.json` excluye este directorio para
// que `tsc -b` no lo publique en `dist/`.
import { vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';
import {
  PlatformServicesProvider,
  type PlatformServices,
} from '../context/PlatformServicesContext';

/** Firma no genérica del spy que respalda `PlatformServices.invoke`. */
type InvokeSpy = Mock<
  (command: string, args?: Record<string, unknown>) => Promise<unknown>
>;

/** Firma del spy que respalda `PlatformServices.subscribeEvent`. */
type SubscribeEventSpy = Mock<
  (event: string, handler: (payload: unknown) => void) => Promise<() => void>
>;

/** Firma del spy que respalda `PlatformServices.openExternalUrl`. */
type OpenExternalUrlSpy = Mock<(url: string) => Promise<void>>;

/** Firma del spy que respalda `PlatformServices.subscribeFileDrop`. */
type SubscribeFileDropSpy = Mock<
  (handler: (paths: readonly string[]) => void) => Promise<() => void>
>;

/** A `PlatformServices` whose four capabilities are individually controllable spies. */
export interface PlatformServicesHarness {
  /** Spy behind `PlatformServices.invoke`. Resolves to `undefined` by default. */
  invoke: InvokeSpy;
  /** Spy behind `PlatformServices.subscribeEvent`. Resolves to a spy unsubscribe by default. */
  subscribeEvent: SubscribeEventSpy;
  /** Spy behind `PlatformServices.openExternalUrl`. */
  openExternalUrl: OpenExternalUrlSpy;
  /** Spy behind `PlatformServices.subscribeFileDrop`. */
  subscribeFileDrop: SubscribeFileDropSpy;
  /** The unsubscribe function the two subscriptions resolve to by default. */
  unsubscribe: Mock<() => void>;
  /** The assembled adapter, stable for the harness's lifetime. */
  services: PlatformServices;
  /** Wrapper for `render` / `renderHook`, providing {@link PlatformServicesHarness.services}. */
  wrapper: (props: { children: ReactNode }) => ReactNode;
  /**
   * Delivers a payload to every handler registered for an event name.
   * @param event - The event the component subscribed to.
   * @param payload - The payload to deliver.
   */
  emit: (event: string, payload: unknown) => void;
  /**
   * Restaura las cuatro implementaciones por defecto, limpia el historial de
   * llamadas y vacía el registro de suscripciones.
   *
   * @remarks
   * Un harness creado a nivel de módulo (necesario cuando `services` debe
   * conservar su identidad entre renders) arrastraría llamadas y overrides de
   * un test al siguiente. Llámalo en un `beforeEach`.
   */
  reset: () => void;
}

/**
 * Builds a fresh {@link PlatformServicesHarness}.
 *
 * @remarks
 * The `services` object is created once per harness, so its identity is stable
 * across renders — the same guarantee the composition root gives, and what
 * `useThemes`' StrictMode guard depends on.
 *
 * Cada suscripción se da de baja de verdad: `subscribeEvent` resuelve a un
 * removedor propio que borra **ese** handler del registro, así que un `emit`
 * posterior a la desuscripción no entrega nada. Un test de fuga o de cleanup
 * puede fallar, que es exactamente para lo que existe el doble.
 *
 * @returns A harness whose spies can be reconfigured per test.
 */
export function createPlatformServicesHarness(): PlatformServicesHarness {
  const unsubscribe: Mock<() => void> = vi.fn();
  const handlers = new Map<string, ((payload: unknown) => void)[]>();

  const registerSubscription = (
    event: string,
    handler: (payload: unknown) => void,
  ): Promise<() => void> => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      const remaining = (handlers.get(event) ?? []).filter(
        (registered) => registered !== handler,
      );
      if (remaining.length > 0) handlers.set(event, remaining);
      else handlers.delete(event);
    };
    return Promise.resolve(() => {
      remove();
      // El spy compartido sigue existiendo para que un test pueda afirmar
      // "se dio de baja", además de comprobar que dejó de entregar.
      unsubscribe();
    });
  };

  const invokeDefault = () => Promise.resolve(undefined);
  const openExternalUrlDefault = () => Promise.resolve();
  const subscribeFileDropDefault = () => Promise.resolve(unsubscribe);

  const subscribeEvent: SubscribeEventSpy = vi.fn(registerSubscription);
  const invoke: InvokeSpy = vi.fn(invokeDefault);
  const openExternalUrl: OpenExternalUrlSpy = vi.fn(openExternalUrlDefault);
  const subscribeFileDrop: SubscribeFileDropSpy = vi.fn(
    subscribeFileDropDefault,
  );

  const services: PlatformServices = {
    // El puerto declara `invoke` genérico; el spy no puede serlo sin perder
    // `mockResolvedValue`, así que la conversión se queda aquí, en un único
    // punto, en vez de castear el objeto entero y perder la comprobación de
    // forma contra `PlatformServices`.
    // La aridad se preserva: reenviar siempre dos argumentos convertiría un
    // `invoke('x')` en `invoke('x', undefined)` y rompería cualquier
    // `toHaveBeenCalledWith('x')`.
    invoke: <T,>(command: string, args?: Record<string, unknown>): Promise<T> =>
      (args === undefined
        ? invoke(command)
        : invoke(command, args)) as Promise<T>,
    subscribeEvent: <T,>(event: string, handler: (payload: T) => void) =>
      subscribeEvent(event, handler as (payload: unknown) => void),
    openExternalUrl,
    subscribeFileDrop,
  };

  return {
    invoke,
    subscribeEvent,
    openExternalUrl,
    subscribeFileDrop,
    unsubscribe,
    services,
    wrapper: ({ children }: { children: ReactNode }) => (
      <PlatformServicesProvider services={services}>
        {children}
      </PlatformServicesProvider>
    ),
    emit: (event, payload) => {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(payload);
    },
    reset: () => {
      handlers.clear();
      unsubscribe.mockClear();
      subscribeEvent.mockReset();
      subscribeEvent.mockImplementation(registerSubscription);
      invoke.mockReset();
      invoke.mockImplementation(invokeDefault);
      openExternalUrl.mockReset();
      openExternalUrl.mockImplementation(openExternalUrlDefault);
      subscribeFileDrop.mockReset();
      subscribeFileDrop.mockImplementation(subscribeFileDropDefault);
    },
  };
}

// packages/ui/src/context/PlatformServicesContext.tsx
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

/**
 * Everything `@vellum/ui` needs from the desktop shell, as one typed contract.
 *
 * @remarks
 * Deliberately generic — four capabilities, not one method per IPC command.
 * The command names themselves already live in `IPC_COMMANDS` (`@vellum/core`),
 * so mirroring them here would duplicate the contract and force this port to
 * change every time a command is added.
 *
 * `@vellum/ui` must not import `@tauri-apps/*`: the shell is an adapter like
 * any other, assembled only by `apps/desktop` (ADR-0001). The rule is enforced
 * by the `packages/ui/src/**` scope in `eslint.config.mjs`.
 *
 * Every member is asynchronous because the underlying IPC bridge is, and every
 * subscription resolves to its own unsubscribe function — the caller owns the
 * lifetime.
 *
 * Los miembros se declaran como **propiedades de función**, no con sintaxis de
 * método: todos los consumidores desestructuran (`const { invoke } =
 * usePlatformServices()`), y la sintaxis de método anunciaría que un adapter
 * basado en clase es admisible — uno que se rompería al desestructurar, porque
 * perdería su `this`.
 */
export interface PlatformServices {
  /**
   * Invokes a shell command by name.
   *
   * @param command - A value of `IPC_COMMANDS`.
   * @param args - Command arguments, serialized across the IPC boundary.
   * @returns The command's typed result.
   */
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

  /**
   * Subscribes to a shell event for as long as the returned function is not called.
   *
   * @param event - A value of `IPC_EVENTS`.
   * @param handler - Called with the event payload on every emission.
   * @returns A promise resolving to the unsubscribe function.
   */
  subscribeEvent: <T>(
    event: string,
    handler: (payload: T) => void,
  ) => Promise<() => void>;

  /**
   * Opens a URL in the user's default browser, outside the app window.
   *
   * @param url - Absolute URL to open.
   */
  openExternalUrl: (url: string) => Promise<void>;

  /**
   * Subscribes to files dropped onto the app window.
   *
   * @remarks
   * The adapter reports paths and nothing else. Which paths are interesting
   * (`.cslmap`) and whether the app is in a state to accept them is UI policy
   * and stays in the component.
   *
   * @param handler - Called with the dropped paths on every completed drop.
   * @returns A promise resolving to the unsubscribe function.
   */
  subscribeFileDrop: (
    handler: (paths: readonly string[]) => void,
  ) => Promise<() => void>;
}

/**
 * The contract with no shell behind it.
 *
 * @remarks
 * Reads resolve to nothing, writes and subscriptions do nothing, and none of
 * it throws — the same "degrade silently, never block boot" invariant the
 * preferences fallback has (NFR9). This is what a component tree rendered
 * outside `<PlatformServicesProvider>` gets: isolated component tests, and any
 * future non-desktop host.
 *
 * Congelado a nivel de módulo (`Object.freeze`), no sólo declarado a nivel de
 * módulo: su identidad es estable — `useThemes` apoya en ella su guarda de
 * invoke único — y ningún consumidor puede sustituir una capacidad por
 * accidente y contaminar al resto de los tests que comparten este default.
 */
export const NOOP_PLATFORM_SERVICES: PlatformServices = Object.freeze({
  // No shell means no result. Every call site already treats a missing value
  // as "the capability is unavailable" rather than as an error to surface.
  invoke: <T,>(): Promise<T> => Promise.resolve(undefined as unknown as T),
  subscribeEvent: () => Promise.resolve(() => {}),
  openExternalUrl: () => Promise.resolve(),
  subscribeFileDrop: () => Promise.resolve(() => {}),
});

const PlatformServicesContext = createContext<PlatformServices>(
  NOOP_PLATFORM_SERVICES,
);

/** Props for {@link PlatformServicesProvider}. */
export interface PlatformServicesProviderProps {
  /**
   * The shell adapter. Create it once in the composition root, never inline in
   * JSX — `useThemes` and the event subscriptions key their effects on it.
   */
  services: PlatformServices;
  /** The subtree that may use the shell. */
  children: ReactNode;
}

/**
 * Injects the desktop shell adapter into `@vellum/ui`, mirroring
 * `PlatformProvider`/`AppMetaProvider`.
 *
 * @remarks
 * The only way shell capabilities enter this package. `apps/desktop` builds the
 * Tauri-backed implementation; `@vellum/ui` only ever sees
 * {@link PlatformServices}.
 *
 * @param props - The adapter and the subtree it serves.
 * @returns The subtree, with the adapter in context.
 */
export function PlatformServicesProvider({
  services,
  children,
}: PlatformServicesProviderProps) {
  const { invoke, subscribeEvent, openExternalUrl, subscribeFileDrop } =
    services;
  // Memoizado sobre las cuatro capacidades, no sobre `services`: un host que
  // reconstruya el objeto literal en cada render (conservando las funciones)
  // haría cambiar la identidad del valor de contexto, y con ella se repetiría
  // el efecto de `use-themes` — derrotando su guarda `hasInvoked` y recargando
  // `load_themes` una vez por render.
  const value = useMemo<PlatformServices>(
    () => ({ invoke, subscribeEvent, openExternalUrl, subscribeFileDrop }),
    [invoke, subscribeEvent, openExternalUrl, subscribeFileDrop],
  );
  return (
    <PlatformServicesContext.Provider value={value}>
      {children}
    </PlatformServicesContext.Provider>
  );
}

/**
 * Reads the shell adapter.
 *
 * @remarks
 * Unlike `usePlatform`, this never throws outside a provider: it falls back to
 * {@link NOOP_PLATFORM_SERVICES}, so a component rendered in isolation degrades
 * to inert shell calls instead of crashing.
 *
 * @returns The active adapter, or the no-op default.
 */
export function usePlatformServices(): PlatformServices {
  return useContext(PlatformServicesContext);
}

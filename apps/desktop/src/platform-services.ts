import type { PlatformServices } from '@vellum/ui';

/**
 * Sobre de un evento del bus de Tauri: el payload viaja anidado.
 *
 * @remarks
 * `PlatformServices.subscribeEvent` entrega el payload desnudo, así que el
 * desempaquetado es responsabilidad de este adapter y no de la UI. Es
 * exactamente el paso que se pierde de vista al leerlo dentro de `main.tsx`.
 */
export interface ShellEventMessage<T> {
  /** Contenido del evento, sin la metadata del bus. */
  payload: T;
}

/**
 * Payload del evento nativo de drag & drop de la ventana.
 *
 * @remarks
 * Unión discriminada por `type`: sólo la fase `drop` trae rutas. Las fases
 * `enter`/`over`/`leave` describen el cursor sobrevolando la ventana y no
 * deben llegar al consumidor — reaccionar a ellas cargaría el archivo antes de
 * que el usuario lo soltara.
 */
export type DragDropEventPayload =
  | { readonly type: 'drop'; readonly paths: readonly string[] }
  | { readonly type: 'enter' | 'over' | 'leave' };

/** Las cuatro primitivas de Tauri que el adapter del shell necesita. */
export interface PlatformServicesDeps {
  /** `invoke` de `@tauri-apps/api/core`. */
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  /** `listen` de `@tauri-apps/api/event`. */
  listen: <T>(
    event: string,
    handler: (message: ShellEventMessage<T>) => void,
  ) => Promise<() => void>;
  /** `openUrl` de `@tauri-apps/plugin-opener`. */
  openUrl: (url: string) => Promise<void>;
  /** `onDragDropEvent` de la webview window actual. */
  onDragDropEvent: (
    handler: (event: ShellEventMessage<DragDropEventPayload>) => void,
  ) => Promise<() => void>;
}

/**
 * Construye la implementación Tauri de cada capacidad de shell que consume
 * `@vellum/ui`.
 *
 * @remarks
 * Las dependencias se inyectan en vez de importarse aquí, igual que en
 * `detect-platform.ts`: así el desempaquetado del payload, el guard de la fase
 * `drop` y la lectura de `paths` quedan cubiertos por tests sin necesidad de un
 * runtime Tauri real.
 *
 * `subscribeFileDrop` reporta rutas y nada más — el filtro `.cslmap` y la regla
 * de "ignorar drops mientras se carga" son política de UI y viven en
 * `MapLibreRoot` (ADR-0001).
 *
 * Llámala una sola vez en el composition root: `useThemes` protege su `invoke`
 * único contra el doble montaje de StrictMode, y esa guarda sólo se sostiene
 * mientras el objeto conserve su identidad entre renders.
 *
 * @param deps - Las primitivas de Tauri, inyectadas.
 * @returns El adapter listo para `PlatformServicesProvider`.
 */
export function createPlatformServices(
  deps: PlatformServicesDeps,
): PlatformServices {
  return {
    invoke: (command, args) => deps.invoke(command, args),
    subscribeEvent: <T>(event: string, handler: (payload: T) => void) =>
      deps.listen<T>(event, (message) => handler(message.payload)),
    openExternalUrl: (url) => deps.openUrl(url),
    subscribeFileDrop: (handler) =>
      deps.onDragDropEvent((event) => {
        if (event.payload.type === 'drop') handler(event.payload.paths);
      }),
  };
}

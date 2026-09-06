import type { PreferencesPort } from '@vellum/ui';

/**
 * La porción de `tauri-plugin-store` que el puerto de preferencias necesita.
 *
 * @remarks
 * Tres operaciones, sin `autoSave` ni ruta de archivo: la carga y su política
 * de fallo son de este adapter, no del store de la UI.
 */
export interface PreferencesStoreLike {
  /** Lee una clave persistida. */
  get: <T>(key: string) => Promise<T | undefined>;
  /** Deja un valor preparado para el siguiente `save`. */
  set: (key: string, value: unknown) => Promise<void>;
  /** Vuelca a disco los valores preparados. */
  save: () => Promise<void>;
}

/**
 * Construye el adapter de preferencias en disco.
 *
 * @remarks
 * `load` se inyecta —y se invoca **una sola vez**, memoizando su promesa— para
 * que la política de fallo sea testeable sin un runtime Tauri: una carga que
 * rechace (p. ej. un `preferences.json` corrupto) se loguea una vez y se
 * memoiza como sesión deshabilitada; a partir de ahí toda lectura resuelve
 * `undefined` y toda escritura se descarta, exactamente el fallback silencioso
 * que el store tenía antes de la inyección (NFR9). Nunca lanza.
 *
 * `autoSave` se queda desactivado del lado del llamador: `persistPreference`
 * vuelca cada escritura por su cuenta, de modo que un cierre forzado no puede
 * perder un cambio que el usuario ya hizo.
 *
 * @param load - Abre el store persistente, p. ej. `() => load('preferences.json', { autoSave: false })`.
 * @returns El puerto listo para `setPreferencesPort`.
 */
export function createPreferencesAdapter(
  load: () => Promise<PreferencesStoreLike>,
): PreferencesPort {
  const storePromise: Promise<PreferencesStoreLike | null> = load().catch(
    (error: unknown) => {
      console.warn('preferences-store: failed to load store', error);
      return null;
    },
  );

  return {
    get: async <T>(key: string): Promise<T | undefined> =>
      (await storePromise)?.get<T>(key),
    set: async (key, value) => {
      await (await storePromise)?.set(key, value);
    },
    save: async () => {
      await (await storePromise)?.save();
    },
  };
}

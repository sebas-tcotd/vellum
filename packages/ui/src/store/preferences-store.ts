import type { LayerVisibility } from '@vellum/core';
import { LAYER_NAMES } from '@vellum/core';

/**
 * User preferences persisted to disk via `tauri-plugin-store`.
 * @remarks
 * Key names are the literal, on-disk identifiers (AC5 of Epic 7) — distinct from
 * the corresponding `VellumStore` field names where they differ (e.g. `selectedTheme`
 * here vs. `activeTheme` in the Zustand store).
 */
export interface PersistedPreferences {
  /** Identifier of the last active visual theme. */
  selectedTheme: string;
  /** Last visibility state of every map layer. */
  activeLayers: LayerVisibility;
  /** Last selected UI language. */
  preferredLanguage: 'en' | 'es';
  /** Whether the automatic update checker was enabled. */
  autoUpdateEnabled: boolean;
}

/**
 * Durable key/value storage for user preferences, as the store needs it.
 *
 * @remarks
 * Narrower than any concrete store API on purpose: three operations, no
 * `autoSave`, no file path. The backing file and its load semantics belong to
 * the adapter, which `apps/desktop` registers via {@link setPreferencesPort} —
 * this module is imported by `vellum-store` and `i18n-setup`, both of which run
 * outside React, so a context could not reach them (ADR-0001).
 */
export interface PreferencesPort {
  /**
   * Reads one persisted key.
   * @param key - On-disk key name.
   * @returns The stored value, or `undefined` when absent.
   */
  get<T>(key: string): Promise<T | undefined>;
  /**
   * Stages one value for the next {@link PreferencesPort.save}.
   * @param key - On-disk key name.
   * @param value - Value to store.
   */
  set(key: string, value: unknown): Promise<void>;
  /** Flushes staged values to durable storage. */
  save(): Promise<void>;
}

/**
 * The port with no storage behind it: reads yield `undefined`, writes do
 * nothing, nothing throws.
 *
 * @remarks
 * Exactly the fallback the previous implementation reached when
 * `preferences.json` failed to load — persistence is disabled for the session
 * and the app boots on defaults (NFR9). It is also the default, so tests and
 * any host that registers no adapter behave identically.
 */
const NOOP_PREFERENCES_PORT: PreferencesPort = {
  get: () => Promise.resolve(undefined),
  set: () => Promise.resolve(),
  save: () => Promise.resolve(),
};

let preferencesPort: PreferencesPort = NOOP_PREFERENCES_PORT;
let writeQueue: Promise<void> = Promise.resolve();

/**
 * Registers the storage adapter this module writes through.
 *
 * @remarks
 * Module-registry injection rather than React context, because the consumers
 * (`vellum-store`, `i18n-setup`) are not components. Call it once from the
 * composition root **before** the first render, or the initial hydration reads
 * the no-op default and the app starts on defaults for that session.
 *
 * @param port - The adapter, or `null` to restore the inert default.
 */
export function setPreferencesPort(port: PreferencesPort | null): void {
  preferencesPort = port ?? NOOP_PREFERENCES_PORT;
}

function isValidLayerVisibility(raw: unknown): LayerVisibility | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  return Object.fromEntries(
    LAYER_NAMES.map((name) => [
      name,
      typeof record[name] === 'boolean' ? record[name] : true,
    ]),
  ) as LayerVisibility;
}

/**
 * Reads all persisted preferences from disk.
 * @remarks
 * Each key is validated independently — an invalid or missing key is simply omitted
 * from the result rather than throwing, so a partially corrupted file (NFR9) never
 * blocks the valid keys next to it. Returns `{}` when no adapter is registered
 * (persistence disabled).
 * @returns Only the keys present and valid on disk.
 */
export async function loadPersistedPreferences(): Promise<
  Partial<PersistedPreferences>
> {
  const store = preferencesPort;
  const result: Partial<PersistedPreferences> = {};

  try {
    const selectedTheme = await store.get<string>('selectedTheme');
    if (typeof selectedTheme === 'string' && selectedTheme.length > 0) {
      result.selectedTheme = selectedTheme;
    }
  } catch (error) {
    console.warn('preferences-store: failed to read selectedTheme', error);
  }

  try {
    const activeLayers = isValidLayerVisibility(
      await store.get('activeLayers'),
    );
    if (activeLayers !== undefined) result.activeLayers = activeLayers;
  } catch (error) {
    console.warn('preferences-store: failed to read activeLayers', error);
  }

  try {
    const preferredLanguage = await store.get<string>('preferredLanguage');
    if (preferredLanguage === 'en' || preferredLanguage === 'es') {
      result.preferredLanguage = preferredLanguage;
    }
  } catch (error) {
    console.warn('preferences-store: failed to read preferredLanguage', error);
  }

  try {
    const autoUpdateEnabled = await store.get<boolean>('autoUpdateEnabled');
    if (typeof autoUpdateEnabled === 'boolean') {
      result.autoUpdateEnabled = autoUpdateEnabled;
    }
  } catch (error) {
    console.warn('preferences-store: failed to read autoUpdateEnabled', error);
  }

  return result;
}

/**
 * Writes a single preference to disk and flushes it immediately.
 * @remarks
 * No debounce/`autoSave` — `set()` is followed by an immediate `save()` so a forced
 * app close never loses a change the user already made (NFR9). Never throws: any
 * failure (disk I/O, an adapter that could not open its file) is logged with
 * `console.warn` and swallowed, so a persistence failure never breaks the UI.
 */
export async function persistPreference<K extends keyof PersistedPreferences>(
  key: K,
  value: PersistedPreferences[K],
): Promise<void> {
  const write = async (): Promise<void> => {
    try {
      await preferencesPort.set(key, value);
      await preferencesPort.save();
    } catch (error) {
      console.warn(`preferences-store: failed to persist ${key}`, error);
    }
  };
  writeQueue = writeQueue.then(write, write);
  await writeQueue;
}

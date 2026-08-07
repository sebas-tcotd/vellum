import type { LayerVisibility } from '@vellum/core';
import { LAYER_NAMES } from '@vellum/core';
import { load, type Store } from '@tauri-apps/plugin-store';

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

const STORE_PATH = 'preferences.json';

let storePromise: Promise<Store | null> | null = null;

/**
 * Lazily loads (and memoizes) the on-disk preferences store.
 * @remarks
 * `autoSave` is explicitly disabled — every write goes through `persistPreference()`,
 * which calls `save()` immediately (see Dev Notes on NFR9 in story 7.2). If the store
 * fails to load (e.g. a corrupted `preferences.json`), the error is logged and `null`
 * is memoized so every subsequent call treats persistence as disabled for this session
 * instead of retrying or throwing.
 */
function getStore(): Promise<Store | null> {
  storePromise ??= load(STORE_PATH, { autoSave: false }).catch((error) => {
    console.warn('preferences-store: failed to load store', error);
    return null;
  });
  return storePromise;
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
 * blocks the valid keys next to it. Returns `{}` (persistence disabled) if the store
 * itself failed to load.
 * @returns Only the keys present and valid on disk.
 */
export async function loadPersistedPreferences(): Promise<
  Partial<PersistedPreferences>
> {
  const store = await getStore();
  if (store === null) return {};

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
 * failure (disk I/O, a store that failed to load) is logged with `console.warn` and
 * swallowed, so a persistence failure never breaks the UI.
 */
export async function persistPreference<K extends keyof PersistedPreferences>(
  key: K,
  value: PersistedPreferences[K],
): Promise<void> {
  try {
    const store = await getStore();
    if (store === null) return;
    await store.set(key, value);
    await store.save();
  } catch (error) {
    console.warn(`preferences-store: failed to persist ${key}`, error);
  }
}

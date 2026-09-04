import type { Platform } from '@vellum/ui';

/**
 * Maps the raw OS string reported by `@tauri-apps/plugin-os` to Vellum's
 * shell `Platform` type.
 *
 * @remarks
 * Kept as a pure function — no `@tauri-apps/plugin-os` import here — so it
 * can be unit tested without a real Tauri runtime, mirroring
 * `window-close-cancel.ts`'s injected-dependency pattern. Any platform value
 * other than `windows`/`macos`/`linux` (e.g. `freebsd`, `android`), and any
 * thrown error from `getPlatform`, resolves to `'unknown'` — platform
 * detection must never block or crash app startup (story edge-case matrix).
 * @param getPlatform - Reads the raw platform string, e.g. `platform()` from
 * `@tauri-apps/plugin-os`.
 */
export function detectPlatform(getPlatform: () => string): Platform {
  try {
    const raw = getPlatform();
    if (raw === 'windows' || raw === 'macos' || raw === 'linux') return raw;
    return 'unknown';
  } catch (error) {
    console.warn(
      '[detectPlatform] platform detection failed; using "unknown"',
      error,
    );
    return 'unknown';
  }
}

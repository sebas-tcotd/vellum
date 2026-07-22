import { invoke } from '@tauri-apps/api/core';
import { IPC_COMMANDS, type RawThemeFile } from '@vellum/core';
import { loadThemes, type LoadedTheme } from '@vellum/theme-engine';
import { useEffect, useRef, useState } from 'react';
import { useVellumStore } from '../store/vellum-store';

/**
 * Loads all `.vellumstyle` themes once at app startup.
 * @remarks
 * Invokes the `load_themes` IPC command, runs the raw files through the theme-engine
 * (`loadThemes`), then populates the store: `availableThemes` (metadata for the selector
 * pills) and `themeWarnings` (for the invalid-theme toast, AC #5). The full `LoadedTheme[]`
 * is returned so the renderer host (`MapLibreRoot`) can resolve `activeTheme` to its
 * `RenderStyleParams` — the store only holds identification metadata, not the color data.
 *
 * @returns The fully-loaded valid themes, or an empty array until loading resolves.
 */
export function useThemes(): LoadedTheme[] {
  const setAvailableThemes = useVellumStore((s) => s.setAvailableThemes);
  const setThemeWarnings = useVellumStore((s) => s.setThemeWarnings);
  const [themes, setThemes] = useState<LoadedTheme[]>([]);
  // React.StrictMode (apps/desktop/src/main.tsx) double-invokes this effect on mount
  // (setup → cleanup → setup). `hasInvoked` skips the redundant second `invoke()` call —
  // two near-simultaneous calls to the same command can race in Tauri's IPC callback
  // registry and drop a response. `isMounted` is reset to `true` at the *start* of every
  // effect run (including the StrictMode no-op second run) and only cleared in cleanup —
  // so the single in-flight invoke's `.then()` still sees `isMounted === true` once
  // StrictMode's second setup has run, even though its own throwaway cleanup fired first.
  // A plain per-run `cancelled` closure variable would stay stuck at `true` forever in
  // that scenario, silently discarding a successful response.
  const hasInvoked = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (!hasInvoked.current) {
      hasInvoked.current = true;
      invoke<RawThemeFile[]>(IPC_COMMANDS.LOAD_THEMES)
        .then((rawFiles) => {
          if (!isMounted.current) return;
          if (!Array.isArray(rawFiles)) return;
          const { themes: loaded, warnings } = loadThemes(rawFiles);
          setThemes(loaded);
          setAvailableThemes(
            loaded.map(({ id, name, source }) => ({ id, name, source })),
          );
          setThemeWarnings(warnings);
        })
        .catch((err: unknown) => {
          console.error('[useThemes] Failed to load themes:', err);
          if (isMounted.current) {
            setThemeWarnings([
              {
                themeId: '*',
                themeName: 'Themes',
                field: 'LOAD_FAILED',
              },
            ]);
          }
        });
    }
    return () => {
      isMounted.current = false;
    };
  }, [setAvailableThemes, setThemeWarnings]);

  return themes;
}

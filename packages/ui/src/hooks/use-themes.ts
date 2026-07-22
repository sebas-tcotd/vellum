import { invoke } from '@tauri-apps/api/core';
import { IPC_COMMANDS, type RawThemeFile } from '@vellum/core';
import { loadThemes, type LoadedTheme } from '@vellum/theme-engine';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    invoke<RawThemeFile[]>(IPC_COMMANDS.LOAD_THEMES)
      .then((rawFiles) => {
        if (cancelled) return;
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
      });
    return () => {
      cancelled = true;
    };
  }, [setAvailableThemes, setThemeWarnings]);

  return themes;
}

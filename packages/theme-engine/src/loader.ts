import type { RawThemeFile, ThemeSource, VellumStyle } from '@vellum/core';
import { migrateTheme } from './schema-migration';
import { validateVellumStyle } from './validators/theme';

/** A validated theme plus the identifying metadata from its source file. */
export type LoadedTheme = VellumStyle & {
  /** Stable identifier — the `.vellumstyle` filename without extension. */
  id: string;
  /** Whether the theme is bundled or user-installed. */
  source: ThemeSource;
};

/**
 * A skipped-theme warning. Kept i18n-agnostic on purpose — the UI layer localizes it
 * into the AC #5 message via a `t()` template (`theme-engine` never depends on i18n).
 */
export interface ThemeWarning {
  /** The offending theme's id (filename without extension). */
  themeId: string;
  /** The field path that failed validation, or `'JSON'` for a parse failure. */
  field: string;
}

/** Outcome of loading a batch of raw theme files: the valid themes and per-file warnings. */
export interface LoadThemesResult {
  /** Themes that parsed, migrated and validated successfully. */
  themes: LoadedTheme[];
  /** One warning per skipped (invalid or malformed) file. */
  warnings: ThemeWarning[];
}

/**
 * Parses, migrates and validates raw `.vellumstyle` files into usable themes.
 * @remarks
 * Each file is handled independently: a `JSON.parse` failure or a validation failure
 * skips that file with a warning without affecting the others (AC #5, #6).
 *
 * @param rawFiles - Raw files as returned by the Rust `load_themes` command.
 * @returns The valid themes and the warnings for the skipped ones.
 */
export function loadThemes(rawFiles: RawThemeFile[]): LoadThemesResult {
  const themes: LoadedTheme[] = [];
  const warnings: ThemeWarning[] = [];

  for (const file of rawFiles) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.rawJson);
    } catch {
      warnings.push({ themeId: file.id, field: 'JSON' });
      continue;
    }
    const result = validateVellumStyle(migrateTheme(parsed));
    if (!result.valid) {
      warnings.push({ themeId: file.id, field: result.error });
      continue;
    }
    themes.push({ ...result.theme, id: file.id, source: file.source });
  }

  return { themes, warnings };
}

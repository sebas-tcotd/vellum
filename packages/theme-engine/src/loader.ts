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
  /** Human-readable theme name for the toast (AC #5). Falls back to `themeId` when the
   * file couldn't be parsed at all, or didn't parse to an object with a `name` string. */
  themeName: string;
  /** The field path that failed validation, or `'JSON'` for a parse failure. */
  field: string;
}

/** Reads `parsed.name` if `parsed` is an object with a non-empty string `name`, else `null`. */
function readThemeName(parsed: unknown): string | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const name = (parsed as Record<string, unknown>).name;
  return typeof name === 'string' && name.length > 0 ? name : null;
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
  const indexById = new Map<string, number>();

  for (const file of rawFiles) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.rawJson);
    } catch {
      warnings.push({ themeId: file.id, themeName: file.id, field: 'JSON' });
      continue;
    }
    const result = validateVellumStyle(migrateTheme(parsed));
    if (!result.valid) {
      warnings.push({
        themeId: file.id,
        themeName: readThemeName(parsed) ?? file.id,
        field: result.error,
      });
      continue;
    }
    const loaded: LoadedTheme = {
      ...result.theme,
      id: file.id,
      source: file.source,
    };
    // Same id from two directories (a user theme overriding a built-in placeholder) —
    // last one wins. Rust always lists built-in files before user files, so this means
    // a user's `.vellumstyle` silently takes precedence over a bundled theme of the same name.
    const existingIndex = indexById.get(file.id);
    if (existingIndex !== undefined) {
      themes[existingIndex] = loaded;
      continue;
    }
    indexById.set(file.id, themes.length);
    themes.push(loaded);
  }

  return { themes, warnings };
}

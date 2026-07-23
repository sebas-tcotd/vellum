import type { RawThemeFile } from '@vellum/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_STYLE_PARAMS } from './default-style';
import { loadThemes } from './loader';

const validJson = (name: string) =>
  JSON.stringify({ schemaVersion: 1, name, ...DEFAULT_RENDER_STYLE_PARAMS });

const rawFile = (
  id: string,
  rawJson: string,
  source: RawThemeFile['source'] = 'built-in',
): RawThemeFile => ({ id, source, rawJson });

describe('loadThemes', () => {
  it('loads valid files and skips invalid/malformed ones independently', () => {
    const invalidColorJson = JSON.stringify({
      schemaVersion: 1,
      name: 'Broken',
      ...DEFAULT_RENDER_STYLE_PARAMS,
      water: 'nope',
    });
    const files = [
      rawFile('day', validJson('Day')),
      rawFile('broken', invalidColorJson),
      rawFile('garbage', '{ not valid json'),
      rawFile('classic', validJson('Classic'), 'user'),
    ];

    const { themes, warnings } = loadThemes(files);

    expect(themes.map((t) => t.id)).toEqual(['day', 'classic']);
    expect(themes[1]?.source).toBe('user');
    expect(warnings).toEqual([
      { themeId: 'broken', themeName: 'Broken', field: 'water' },
      { themeId: 'garbage', themeName: 'garbage', field: 'JSON' },
    ]);
  });

  it('preserves the original rawJson on a loaded theme (audit trail)', () => {
    const json = validJson('Day');
    const { themes } = loadThemes([rawFile('day', json)]);
    expect(themes[0]?.rawJson).toBe(json);
  });

  it('falls back themeName to the file id when the raw JSON is a top-level array', () => {
    const { warnings } = loadThemes([rawFile('weird', '[1,2,3]')]);
    expect(warnings).toEqual([
      { themeId: 'weird', themeName: 'weird', field: 'name' },
    ]);
  });

  it('returns empty results for empty input', () => {
    expect(loadThemes([])).toEqual({ themes: [], warnings: [] });
  });

  it('a user theme overrides a built-in theme with the same id', () => {
    const files = [
      rawFile('day', validJson('Day'), 'built-in'),
      rawFile('day', validJson('Custom Day'), 'user'),
    ];

    const { themes } = loadThemes(files);

    expect(themes).toHaveLength(1);
    expect(themes[0]?.name).toBe('Custom Day');
    expect(themes[0]?.source).toBe('user');
  });
});

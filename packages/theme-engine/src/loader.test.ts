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
      { themeId: 'broken', field: 'water' },
      { themeId: 'garbage', field: 'JSON' },
    ]);
  });

  it('returns empty results for empty input', () => {
    expect(loadThemes([])).toEqual({ themes: [], warnings: [] });
  });
});

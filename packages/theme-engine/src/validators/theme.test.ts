import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_STYLE_PARAMS } from '../default-style';
import { validateVellumStyle } from './theme';

/** A complete, valid `.vellumstyle` object built from the canonical default palette. */
const validTheme = {
  schemaVersion: 1,
  name: 'Day',
  ...DEFAULT_RENDER_STYLE_PARAMS,
};

describe('validateVellumStyle', () => {
  it('accepts a complete, well-formed theme', () => {
    const result = validateVellumStyle(validTheme);
    expect(result.valid).toBe(true);
  });

  it('rejects a nested invalid ColorToken and names the exact field path', () => {
    const bad = {
      ...validTheme,
      roads: {
        ...validTheme.roads,
        highway: {
          ...validTheme.roads.highway,
          generic: { fill: 'not-a-color', casing: '#7d748e' },
        },
      },
    };
    const result = validateVellumStyle(bad);
    expect(result).toEqual({
      valid: false,
      error: 'roads.highway.generic.fill',
    });
  });

  it('rejects a theme missing a required color field, naming its path', () => {
    const { water: _omitted, ...withoutWater } = validTheme;
    const result = validateVellumStyle(withoutWater);
    expect(result).toEqual({ valid: false, error: 'water' });
  });

  it('rejects a theme with a missing/empty name', () => {
    expect(validateVellumStyle({ ...validTheme, name: '' })).toEqual({
      valid: false,
      error: 'name',
    });
  });

  it('rejects a non-object root', () => {
    expect(validateVellumStyle(null)).toEqual({ valid: false, error: 'root' });
  });

  it('ignores unknown top-level fields (extension points, Story 5.4 AC #5)', () => {
    const result = validateVellumStyle({
      ...validTheme,
      _authorNotes: 'made with love',
    });
    expect(result.valid).toBe(true);
  });

  it('ignores unknown fields nested inside an existing group (extension points, Story 5.4 AC #5)', () => {
    const result = validateVellumStyle({
      ...validTheme,
      roads: {
        ...validTheme.roads,
        highway: { ...validTheme.roads.highway, _extra: 'bar' },
      },
    });
    expect(result.valid).toBe(true);
  });
});

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
      rule: 'color-token',
    });
  });

  it('rejects a theme missing a required color field, naming its path', () => {
    const { water: _omitted, ...withoutWater } = validTheme;
    const result = validateVellumStyle(withoutWater);
    expect(result).toEqual({
      valid: false,
      error: 'water',
      rule: 'required',
    });
  });

  it('rejects a theme with a missing/empty name as `required`', () => {
    // Un nombre vacío está presente pero no identifica al tema: cuenta como ausente.
    expect(validateVellumStyle({ ...validTheme, name: '' })).toEqual({
      valid: false,
      error: 'name',
      rule: 'required',
    });
    const { name: _omitted, ...nameless } = validTheme;
    expect(validateVellumStyle(nameless)).toEqual({
      valid: false,
      error: 'name',
      rule: 'required',
    });
  });

  it('reports rule `type` for a `name` that is present but not a string', () => {
    for (const name of [42, {}, null, []]) {
      expect(
        validateVellumStyle({ ...validTheme, name }),
        String(name),
      ).toEqual({ valid: false, error: 'name', rule: 'type' });
    }
  });

  it('rejects a non-object root', () => {
    expect(validateVellumStyle(null)).toEqual({
      valid: false,
      error: 'root',
      rule: 'type',
    });
  });

  it('reports rule `type` for a non-number schemaVersion', () => {
    expect(validateVellumStyle({ ...validTheme, schemaVersion: 'v1' })).toEqual(
      { valid: false, error: 'schemaVersion', rule: 'type' },
    );
  });

  it('reports rule `required` for an absent schemaVersion', () => {
    // En la app `migrateTheme` siempre lo rellena, pero `validateVellumStyle` es export
    // público y un llamador directo tiene que ver "falta", no "tipo equivocado".
    const { schemaVersion: _omitted, ...unmigrated } = validTheme;
    expect(validateVellumStyle(unmigrated)).toEqual({
      valid: false,
      error: 'schemaVersion',
      rule: 'required',
    });
  });

  it('reports rule `required` for a missing group and `type` for a non-object one', () => {
    const { terrain: _omitted, ...withoutTerrain } = validTheme;
    expect(validateVellumStyle(withoutTerrain)).toEqual({
      valid: false,
      error: 'terrain',
      rule: 'required',
    });
    expect(validateVellumStyle({ ...validTheme, terrain: 'nope' })).toEqual({
      valid: false,
      error: 'terrain',
      rule: 'type',
    });
  });

  it('reports a group passed as an array as `type` on the group, not `required` on a leaf', () => {
    // `typeof [] === 'object'`: sin el guard el walk entraba y culpaba a `terrain.base`.
    expect(validateVellumStyle({ ...validTheme, terrain: [] })).toEqual({
      valid: false,
      error: 'terrain',
      rule: 'type',
    });
    expect(validateVellumStyle({ ...validTheme, roads: ['#fff'] })).toEqual({
      valid: false,
      error: 'roads',
      rule: 'type',
    });
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

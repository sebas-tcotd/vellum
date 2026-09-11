import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_STYLE_PARAMS } from './default-style';
import { CURRENT_SCHEMA_VERSION, migrateTheme } from './schema-migration';
import { validateVellumStyle } from './validators/theme';

describe('migrateTheme', () => {
  it('v1 is a pass-through preserving all fields', () => {
    const raw = { schemaVersion: 1, name: 'Day', water: '#6db8b7' };
    const result = migrateTheme(raw);
    expect(result).toMatchObject(raw);
  });

  it('defaults an absent schemaVersion to 1', () => {
    const result = migrateTheme({ name: 'NoVersion' });
    expect(result.schemaVersion).toBe(1);
  });

  it('does not throw on non-object input, still yielding schemaVersion 1', () => {
    expect(migrateTheme(null).schemaVersion).toBe(1);
    expect(migrateTheme('nope').schemaVersion).toBe(1);
  });

  it('treats a raw array like an invalid/empty object instead of spreading its indices', () => {
    const result = migrateTheme([1, 2, 3]);
    expect(result.schemaVersion).toBe(1);
    expect(result.mapBackground).toBe(
      DEFAULT_RENDER_STYLE_PARAMS.mapBackground,
    );
    expect(result).not.toHaveProperty('0');
    expect(result).not.toHaveProperty('1');
    expect(result).not.toHaveProperty('2');
  });

  it('treats NaN and Infinity schemaVersion as missing, defaulting to 1', () => {
    expect(migrateTheme({ schemaVersion: NaN }).schemaVersion).toBe(1);
    expect(migrateTheme({ schemaVersion: Infinity }).schemaVersion).toBe(1);
    expect(migrateTheme({ schemaVersion: -Infinity }).schemaVersion).toBe(1);
  });

  it(
    'a valid v1 .vellumstyle survives migration + validation without error ' +
      '(Story 5.4 AC #2 non-regression proxy — a real future schema version does not exist yet to test against)',
    () => {
      const v1Theme = {
        schemaVersion: 1,
        name: 'Day',
        ...DEFAULT_RENDER_STYLE_PARAMS,
      };
      const migrated = migrateTheme(v1Theme);
      expect(validateVellumStyle(migrated)).toEqual({
        valid: true,
        theme: migrated,
      });
    },
  );

  it('the current schema version is 1 (bumping it is a contract change)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it('legacy branch: no schemaVersion → stamped 1 and omitted groups filled', () => {
    const result = migrateTheme({ name: 'Legacy' });
    expect(result.schemaVersion).toBe(1);
    expect(result.grid).toEqual(DEFAULT_RENDER_STYLE_PARAMS.grid);
    expect(result.roads).toEqual(DEFAULT_RENDER_STYLE_PARAMS.roads);
  });

  it('keeps a declared version at or below the current one (0, 1.5 still load)', () => {
    expect(migrateTheme({ name: 'x', schemaVersion: 0 }).schemaVersion).toBe(0);
    expect(migrateTheme({ name: 'x', schemaVersion: 1.5 }).schemaVersion).toBe(
      1.5,
    );
  });

  it('future branch: a newer schemaVersion is kept and loaded best-effort', () => {
    const raw = { name: 'Future', schemaVersion: 7, futureGroup: { a: 1 } };
    const result = migrateTheme(raw);
    expect(result.schemaVersion).toBe(7);
    expect(result).toMatchObject({ futureGroup: { a: 1 } });
    expect(result.water).toBe(DEFAULT_RENDER_STYLE_PARAMS.water);
    expect(validateVellumStyle(result).valid).toBe(true);
  });

  it('never mutates its input, in any branch', () => {
    for (const raw of [
      { name: 'Legacy' },
      { name: 'Current', schemaVersion: 1, roads: { _x: 1 } },
      { name: 'Future', schemaVersion: 9 },
    ]) {
      const snapshot = structuredClone(raw);
      const result = migrateTheme(raw);
      expect(raw).toEqual(snapshot);
      expect(result).not.toBe(raw);
    }
  });
});

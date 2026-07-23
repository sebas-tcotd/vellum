import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_STYLE_PARAMS } from './default-style';
import { migrateTheme } from './schema-migration';
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
    expect(result).toEqual({ schemaVersion: 1 });
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
});

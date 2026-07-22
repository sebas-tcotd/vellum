import { describe, expect, it } from 'vitest';
import { migrateTheme } from './schema-migration';

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
});

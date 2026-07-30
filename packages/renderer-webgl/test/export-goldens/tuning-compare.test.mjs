import { describe, expect, it } from 'vitest';
import {
  buildTuningMatrix,
  compareTuningCase,
  validateTuningManifest,
} from './tuning-compare.mjs';

describe('6.2H tuning comparator', () => {
  it('builds the complete fixture/area/scale/background matrix', () => {
    const cases = buildTuningMatrix();
    expect(cases).toHaveLength(36);
    expect(new Set(cases.map((entry) => entry.fixture))).toHaveProperty(
      'size',
      2,
    );
  });

  it('requires unknown metrics instead of inventing measurements', async () => {
    expect(() =>
      validateTuningManifest({ schemaVersion: 1, cases: [] }),
    ).toThrow('matrix');
    const entry = buildTuningMatrix()[0];
    await expect(
      compareTuningCase(
        { ...entry, candidate: 'missing.png' },
        { golden: { result: { status: 'unknown' } } },
        async () => {
          throw new Error('should not read unknown golden');
        },
      ),
    ).resolves.toMatchObject({ status: 'unknown' });
  });
});

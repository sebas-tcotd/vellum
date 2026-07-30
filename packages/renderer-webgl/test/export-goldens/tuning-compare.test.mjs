import { describe, expect, it } from 'vitest';
import {
  buildTuningMatrix,
  compareTuningCase,
  findGoldenCase,
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

  it('matches technique-specific goldens when the golden manifest provides them', () => {
    const entry = { ...buildTuningMatrix(['ssaa-2x'])[0] };
    const goldens = [
      { ...entry, technique: 'box-3x3', golden: 'box.png' },
      { ...entry, technique: 'ssaa-2x', golden: 'ssaa.png' },
    ];

    expect(findGoldenCase(goldens, entry)?.golden).toBe('ssaa.png');
  });
});

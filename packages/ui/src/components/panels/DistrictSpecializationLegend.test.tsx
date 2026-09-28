import { describe, it, expect } from 'vitest';
import { DEFAULT_RENDER_STYLE_PARAMS } from '@vellum/theme-engine';
import type { District } from '@vellum/core';
import { specializationLegendGroups } from './DistrictSpecializationLegend';
const district = (specializations: string[]): District => ({
  id: 'd',
  name: 'D',
  position: { x: 0, y: 0, z: 0 },
  specializations,
  boundary: [
    {
      exterior: [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 0],
      ],
      holes: [],
    },
  ],
});
describe('specialization legend', () => {
  it('deduplicates present names, groups same colors and includes neutral', () => {
    const theme = structuredClone(DEFAULT_RENDER_STYLE_PARAMS);
    theme.buildings.industry.forestry.fill = '#123456';
    theme.buildings.industry.farming.fill = '#123456';
    const groups = specializationLegendGroups(
      [
        district(['Forest', 'forest']),
        district(['Farming']),
        district(['Future']),
      ],
      theme,
    );
    expect(groups.find((g) => g.colors.includes('#123456'))?.names).toEqual([
      'farming',
      'forest',
    ]);
    expect(groups.find((g) => g.neutral)?.colors).toEqual([
      theme.districts.fill,
    ]);
  });
  it('omits missing geometry, retains generic winning sector and follows theme', () => {
    expect(
      specializationLegendGroups(
        [{ ...district(['Forest']), boundary: undefined }],
        DEFAULT_RENDER_STYLE_PARAMS,
      ),
    ).toEqual([]);
    const theme = structuredClone(DEFAULT_RENDER_STYLE_PARAMS);
    theme.buildings.industry.generic.fill = '#abcdef';
    expect(
      specializationLegendGroups([district(['Forest', 'Farming'])], theme),
    ).toContainEqual({
      colors: ['#abcdef'],
      names: ['farming', 'forest'],
      neutral: false,
    });
  });
});

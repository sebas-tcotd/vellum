import { describe, expect, it } from 'vitest';
import {
  classifyRoadCategory,
  classifyRoadTier,
  EXCLUDED_ROAD_CLASSES,
  ITEM_CLASS_TIER,
  ROAD_WIDTH_STYLES,
  type RoadTier,
} from './road-classification';

describe('classifyRoadTier', () => {
  it('classifies a known item class by table, ignoring width', () => {
    expect(classifyRoadTier('Small Road Tunnel', ['Road', 'Tunnel'], 16)).toBe(
      'local',
    );
    expect(ROAD_WIDTH_STYLES.local).toEqual({ fixed: 0.2, scaled: 0.8 });
  });

  it('classifies elevated monorail as the metro tier', () => {
    expect(classifyRoadTier('Monorail Track Elevated', ['Elevated'], 8)).toBe(
      'metro',
    );
  });

  it('returns null for excluded classes', () => {
    expect(classifyRoadTier('Bus Line', ['None'], 10)).toBeNull();
    expect(classifyRoadTier('Electricity Wire', ['None'], 4)).toBeNull();
  });

  it('keeps ferry and airship paths on the width heuristic', () => {
    // Neither is in ITEM_CLASS_TIER, so the modded-asset fallback decides.
    expect(classifyRoadTier('Ferry Path', ['None'], 4)).toBe('pedestrianWay');
    expect(classifyRoadTier('Blimp Line', ['None'], 4)).toBe('pedestrianWay');
  });

  it('falls back to wayType for an unknown modded asset', () => {
    expect(classifyRoadTier('Super Freeway DLC', ['Highway'], 12)).toBe(
      'highway',
    );
    expect(classifyRoadTier('Fancy Boardwalk', ['Pedestrian'], 12)).toBe(
      'pedestrianWay',
    );
  });

  it('falls back to width when no wayType is useful, without throwing', () => {
    expect(classifyRoadTier('Unknown Asset', ['None'], 30)).toBe(
      'largeArterial',
    );
    expect(classifyRoadTier('Unknown Asset', ['None'], 20)).toBe('local');
    expect(classifyRoadTier('Unknown Asset', ['None'], 5)).toBe(
      'pedestrianWay',
    );
  });

  it('treats Object.prototype member names as unknown modded assets', () => {
    // Item classes come from user-supplied .cslmap files: a bare
    // `ITEM_CLASS_TIER[itemClass]` would resolve these to inherited Function
    // values and hand a bogus "tier" to ROAD_WIDTH_STYLES.
    for (const hostile of ['constructor', 'toString', 'valueOf', '__proto__']) {
      expect(classifyRoadTier(hostile, ['Highway'], 4)).toBe('highway');
      expect(classifyRoadTier(hostile, ['None'], 30)).toBe('largeArterial');
      expect(classifyRoadTier(hostile, ['None'], 4)).toBe('pedestrianWay');
      expect(
        ROAD_WIDTH_STYLES[classifyRoadTier(hostile, ['None'], 4)!],
      ).toEqual({ fixed: 0.1, scaled: 0.3 });
    }
  });

  it('gives every tier it can return a width style', () => {
    for (const tier of Object.values(ITEM_CLASS_TIER)) {
      expect(ROAD_WIDTH_STYLES[tier]).toBeDefined();
    }
  });
});

describe('classifyRoadCategory', () => {
  it('routes excluded classes to the excluded category', () => {
    expect(classifyRoadCategory('Bus Line')).toBe('excluded');
    expect(classifyRoadCategory('Electricity Wire')).toBe('excluded');
  });

  it('routes ferry and airship paths to their own categories', () => {
    expect(classifyRoadCategory('Ferry Path')).toBe('ferry');
    expect(classifyRoadCategory('Blimp Path')).toBe('airship');
    expect(classifyRoadCategory('Blimp Line')).toBe('airship');
  });

  it('routes ordinary and modded road classes to road', () => {
    expect(classifyRoadCategory('Small Road Tunnel')).toBe('road');
    expect(classifyRoadCategory('Highway Elevated')).toBe('road');
    expect(classifyRoadCategory('Unknown Modded Asset')).toBe('road');
  });

  it('gives the cable-car way its own category, not a road hairline', () => {
    // 12.4 world units falls under the heuristic's 14-unit cut, so its tier is
    // a pedestrian way. The category is what earns it a dedicated layer.
    expect(classifyRoadCategory('CableCar Path')).toBe('cablecar');
    expect(classifyRoadTier('CableCar Path', ['None'], 12.4)).toBe(
      'pedestrianWay',
    );
  });

  it('routes runways to their own category while keeping them road geometry', () => {
    expect(classifyRoadCategory('Airplane Runway')).toBe('runway');
    // Pinned to one tier: 20 and 44 straddle the 28-unit cut, which used to
    // change a single runway's thickness halfway down its own length.
    expect(classifyRoadTier('Airplane Runway', ['None'], 20)).toBe('highway');
    expect(classifyRoadTier('Airplane Runway', ['None'], 44)).toBe('highway');
  });

  it('routes rail item classes to railway', () => {
    expect(classifyRoadCategory('Monorail Track Elevated')).toBe('railway');
    expect(classifyRoadCategory('Train Track')).toBe('railway');
  });

  it('holds tier ∈ {train, metro} ⇔ category === railway', () => {
    const railTiers = new Set<RoadTier>(['train', 'metro']);

    for (const itemClass of Object.keys(ITEM_CLASS_TIER)) {
      const tier = ITEM_CLASS_TIER[itemClass]!;
      const isRail = railTiers.has(tier);
      expect(classifyRoadCategory(itemClass) === 'railway').toBe(isRail);
    }
  });

  it('gives every category a tier, so nothing can be categorised into nothing', () => {
    for (const itemClass of [
      'Small Road',
      'Airplane Runway',
      'CableCar Path',
      'Ferry Path',
      'Blimp Path',
      'Train Track',
    ]) {
      expect(classifyRoadTier(itemClass, ['None'], 20)).not.toBeNull();
    }
  });

  it('routes Object.prototype member names to the road category', () => {
    for (const hostile of ['constructor', 'toString', 'valueOf', '__proto__']) {
      expect(classifyRoadCategory(hostile)).toBe('road');
    }
  });

  it('never marks a non-excluded class as excluded', () => {
    for (const itemClass of Object.keys(ITEM_CLASS_TIER)) {
      expect(EXCLUDED_ROAD_CLASSES.has(itemClass)).toBe(false);
      expect(classifyRoadCategory(itemClass)).not.toBe('excluded');
    }
  });
});

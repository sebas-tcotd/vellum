// packages/renderer-canvas/src/renderer.test.ts
import { describe, it, expect } from 'vitest';
import { makeCityData } from '@vellum/core/testing';
import type { IRenderer } from '@vellum/core';
import { CanvasRenderer } from './renderer';

describe('CityData factory', () => {
  it('creates a valid minimal CityData', () => {
    const cityData = makeCityData();

    expect(cityData.cityName).toBe('Test City');
    expect(cityData.roadSegments).toEqual([]);
    expect(cityData.landTiles).toEqual([]);
    // LandArray y WaterArray siempre presentes y separados — nunca undefined
    expect(cityData.waterTiles).toBeDefined();
    expect(cityData.landTiles).toBeDefined();
    expect(Array.isArray(cityData.waterTiles)).toBe(true);
    expect(Array.isArray(cityData.landTiles)).toBe(true);
  });

  it('applies overrides correctly', () => {
    const cityData = makeCityData({ cityName: 'Mi Ciudad' });
    expect(cityData.cityName).toBe('Mi Ciudad');
    // Otros campos mantienen sus defaults
    expect(cityData.bounds.seaLevel).toBe(40);
  });
});

describe('CanvasRenderer', () => {
  it('instancia sin errores', () => {
    const renderer = new CanvasRenderer();
    expect(renderer).toBeDefined();
    renderer.dispose();
  });

  it('implementa el contrato IRenderer', () => {
    const renderer: IRenderer = new CanvasRenderer();
    expect(typeof renderer.render).toBe('function');
    expect(typeof renderer.updateViewport).toBe('function');
    expect(typeof renderer.resize).toBe('function');
    expect(typeof renderer.dispose).toBe('function');
    renderer.dispose();
  });
});

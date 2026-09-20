// Integración con i18next real (sin mock) — SchematicSidebarContent.test.tsx
// mockea `t` y sólo comprueba qué clave se elige, así que una forma plural
// ausente pasaría inadvertida y la única línea visible se anunciaría como
// «1 líneas visibles».
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type { CityData, TransitMode } from '@vellum/core';
import { cleanup, render, screen } from '../../test-utils';
import { SchematicSidebarContent } from './SchematicSidebarContent';
import { useSchematicNetwork } from '../../hooks/use-schematic-network';
import { initI18n, i18n } from '../../i18n/i18n-setup';

const node = (id: string, x: number, z: number) => ({
  id,
  position: { x, y: 0, z },
});

const city: CityData = makeCityData({
  roadNodes: [node('a', 0, 0), node('b', 100, 0), node('c', 100, 300)],
  roadSegments: [
    makeRoadSegment({ id: 's1', startNodeId: 'a', endNodeId: 'b' }),
    makeRoadSegment({ id: 's2', startNodeId: 'b', endNodeId: 'c' }),
  ],
  transitLines: [
    makeTransitLine({
      id: 'L1',
      name: 'Red line',
      mode: 'Bus',
      color: '#ff0000',
      route: [{ segmentIds: ['s1', 's2'] }],
    }),
    makeTransitLine({
      id: 'L2',
      name: 'Blue line',
      mode: 'Tram',
      color: '#0000ff',
      route: [{ segmentIds: ['s1'] }],
    }),
  ],
});

const modelOf = (hiddenModes: TransitMode[]) =>
  renderHook(() => useSchematicNetwork({ cityData: city, hiddenModes })).result
    .current;

function renderPanel(hiddenModes: TransitMode[]) {
  return render(
    <SchematicSidebarContent
      model={modelOf(hiddenModes)}
      onToggleMode={() => {}}
      onShowAllModes={() => {}}
    />,
  );
}

describe('SchematicSidebarContent — recuento anunciado (i18n real)', () => {
  beforeAll(async () => {
    await initI18n();
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('usa la forma singular con una sola línea visible, en ambos idiomas', async () => {
    renderPanel(['Tram']);
    expect(screen.getByTestId('schematic-visible-count')).toHaveTextContent(
      '1 line visible',
    );

    cleanup();
    await i18n.changeLanguage('es');
    renderPanel(['Tram']);
    expect(screen.getByTestId('schematic-visible-count')).toHaveTextContent(
      '1 línea visible',
    );
  });

  it('usa la forma plural con varias y con ninguna', async () => {
    const { rerender } = renderPanel([]);
    expect(screen.getByTestId('schematic-visible-count')).toHaveTextContent(
      '2 lines visible',
    );

    rerender(
      <SchematicSidebarContent
        model={modelOf(['Bus', 'Tram'])}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    expect(screen.getByTestId('schematic-visible-count')).toHaveTextContent(
      '0 lines visible',
    );
  });
});

describe('SchematicSidebarContent — selector de layout (i18n real)', () => {
  beforeAll(async () => {
    await initI18n();
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  function renderSelector() {
    return render(
      <SchematicSidebarContent
        model={modelOf([])}
        onToggleMode={() => {}}
        onShowAllModes={() => {}}
        layoutId="geographic"
        onSetLayout={() => {}}
      />,
    );
  }

  it('nombra cada geometría y su marca en los dos idiomas', async () => {
    renderSelector();
    expect(
      screen.getByRole('radiogroup', { name: 'Diagram geometry' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('schematic-layout-geographic')).toHaveTextContent(
      'Geographic trace',
    );
    expect(screen.getByTestId('schematic-layout-octilinear')).toHaveTextContent(
      'Octilinear',
    );
    // La marca es texto, no sólo color: se traduce como cualquier otra palabra.
    expect(
      screen.getByTestId('schematic-layout-orthoradial'),
    ).toHaveTextContent('experimental');

    cleanup();
    await i18n.changeLanguage('es');
    renderSelector();
    expect(
      screen.getByRole('radiogroup', { name: 'Geometría del diagrama' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('schematic-layout-geographic')).toHaveTextContent(
      'Trazado geográfico',
    );
    expect(screen.getByTestId('schematic-layout-octilinear')).toHaveTextContent(
      'Octilineal',
    );
  });

  it('no deja ninguna clave sin traducir en el selector', () => {
    const { container } = renderSelector();
    const section = container.querySelector(
      '[data-testid="schematic-layout-section"]',
    );
    expect(section?.textContent).not.toContain('schematicLayouts.');
    expect(section?.textContent).not.toContain('schematicSidebar.');
  });
});

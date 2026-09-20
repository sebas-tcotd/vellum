// El punto central de la historia 4.2: el inset del diagrama y el padding
// geográfico son dos cosas distintas. Sin este test se pueden colapsar en uno
// solo y toda la suite sigue verde — y el renderer oculto se reencuadraría al
// redimensionar un panel que no es el suyo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { makeCityData, transitFixture } from '@vellum/core/testing';
import {
  deriveTransitNetwork,
  geographicSchematicLayout,
  octilinearSchematicLayout,
  orthoradialSchematicLayout,
  type SchematicLayoutStrategy,
} from '@vellum/core';
import { cleanup, render, screen, act } from '../test-utils';
import { AppSurface } from './AppSurface';
import { useShellSession } from '../shell/shell-session';
import { useVellumStore } from '../store/vellum-store';
import type { CommandRegistry } from '../shell/commands';
import type { MapLibreRootProps } from './canvas/MapLibreRoot';
import type { useExportWorkflow } from '../hooks/use-export-workflow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
}));

/** The renderer is the subscriber under test: record what padding it is told. */
const viewportPaddingLeft: (number | undefined)[] = [];
vi.mock('./canvas/MapLibreRoot', () => ({
  MapLibreRoot: (props: { viewportPadding?: { left: number } }) => {
    viewportPaddingLeft.push(props.viewportPadding?.left);
    return (
      <div
        data-testid="maplibre-root"
        data-padding-left={String(props.viewportPadding?.left ?? '')}
      />
    );
  },
}));

// The real sidebar measures itself, and jsdom has no layout. This stand-in
// reports the widths the test asks for, which is the input AppSurface actually
// consumes. Two distinct values are the whole point: with one, a single shared
// inset would be indistinguishable from two separate ones.
vi.mock('./sidebar/MapAppearanceSidebar', () => ({
  MapAppearanceSidebar: ({
    onOccupiedWidthChange,
  }: {
    onOccupiedWidthChange?: (width: number) => void;
  }) => (
    <>
      <button
        type="button"
        data-testid="report-320"
        onClick={() => onOccupiedWidthChange?.(320)}
      >
        320
      </button>
      <button
        type="button"
        data-testid="report-240"
        onClick={() => onOccupiedWidthChange?.(240)}
      >
        240
      </button>
    </>
  ),
}));

const commands = new Proxy(
  {},
  {
    get: (_target, id: string) => ({ id, canExecute: true, execute: () => {} }),
  },
) as CommandRegistry;

const mapProps = {
  createRenderer: () => {
    throw new Error('the renderer is mocked away in this suite');
  },
} as unknown as MapLibreRootProps;

const exportWorkflow = {
  isExporting: false,
  isExportDialogOpen: false,
  isPreviewCapturing: false,
  exportPreview: null,
  exportPhase: null,
  exportProgress: null,
  exportResult: null,
  exportCancelled: false,
  exportError: null,
  exportWarnings: [],
  setIsExportDialogOpen: () => {},
  handleRecapturePreview: () => {},
  handleExport: () => {},
  handleCancelExport: () => {},
} as unknown as ReturnType<typeof useExportWorkflow>;

/** Exposes the session so the test can drive the view and the widths. */
let session: ReturnType<typeof useShellSession>;

function Harness() {
  session = useShellSession(1440);
  return (
    <AppSurface
      mapProps={mapProps}
      subscribeServiceIconLegendRef={{ current: null }}
      iconLegendToggleRef={{ current: null }}
      exportWorkflow={exportWorkflow}
      commands={commands}
      shell={session}
      isCleanMode={false}
      isPreferencesOpen={false}
      setIsPreferencesOpen={() => {}}
      isAboutOpen={false}
      setIsAboutOpen={() => {}}
      loadFilePartial={async () => {}}
      onDlcDismiss={() => {}}
      onThemeWarningsDismiss={() => {}}
    />
  );
}

const schematicPaddingLeft = () =>
  (
    screen.getByTestId('schematic-view').parentElement?.parentElement as
      | HTMLElement
      | undefined
  )?.style.paddingLeft;

const rendererPaddingLeft = () =>
  screen.getByTestId('maplibre-root').getAttribute('data-padding-left');

beforeEach(() => {
  viewportPaddingLeft.length = 0;
  useVellumStore.setState({
    cityData: makeCityData({ cityName: 'Altavento' }),
    loadingState: 'idle',
  });
});

afterEach(() => {
  cleanup();
  useVellumStore.setState({ cityData: null });
});

describe('AppSurface — schematic inset vs geographic padding', () => {
  it('moves the diagram without reframing the hidden map', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // A geographic measurement reaches the renderer, as it always has.
    await user.click(screen.getByTestId('report-320'));
    expect(rendererPaddingLeft()).toBe('320');

    act(() => {
      session.dispatch({ type: 'viewMode/toggle' });
    });
    expect(screen.getByTestId('schematic-view')).toBeInTheDocument();

    // The schematic sidebar now occupies a different width. The diagram has to
    // move out of its way; the hidden map must stay framed as it was left.
    viewportPaddingLeft.length = 0;
    await user.click(screen.getByTestId('report-240'));
    expect(schematicPaddingLeft()).toBe('240px');
    expect(rendererPaddingLeft()).toBe('320');
    // Not even a transient re-render handed the renderer the new width.
    expect(viewportPaddingLeft.filter((value) => value !== 320)).toEqual([]);
  });

  it('follows the sidebar again once the map is back on screen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('report-320'));

    act(() => {
      session.dispatch({ type: 'viewMode/toggle' });
    });
    await user.click(screen.getByTestId('report-240'));
    expect(rendererPaddingLeft()).toBe('320');

    act(() => {
      session.dispatch({ type: 'viewMode/toggle' });
    });
    // Back on the map, the last measurement is the one that counts.
    expect(screen.queryByTestId('schematic-view')).toBeNull();
    expect(rendererPaddingLeft()).toBe('240');
  });
});

// Story 4.3: alternar geometría esquemática es una pregunta sobre el diagrama.
// Sin este test, pasar el layout por el store o recomputar el inset geográfico
// pasaría inadvertido y el mapa oculto se reencuadraría al comparar layouts.
describe('AppSurface — switching schematic layout', () => {
  it('redraws only the diagram and never reframes the hidden map', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByTestId('report-320'));
    expect(rendererPaddingLeft()).toBe('320');
    const storeBefore = useVellumStore.getState();

    act(() => {
      session.dispatch({ type: 'viewMode/toggle' });
    });
    await user.click(screen.getByTestId('report-240'));
    act(() => {
      session.dispatch({ type: 'schematic/setWidth', width: 300 });
    });
    viewportPaddingLeft.length = 0;

    for (const layoutId of [
      'octilinear',
      'orthoradial',
      'geographic',
    ] as const) {
      act(() => {
        session.dispatch({ type: 'schematic/setLayout', layoutId });
      });
      expect(session.state.schematic.layoutId).toBe(layoutId);
      // The diagram is still the only surface on screen, and it is one `<svg>`:
      // two geometries can never be drawn at once.
      expect(screen.getAllByTestId('schematic-view')).toHaveLength(1);
      // Mode filters are semantic, not geometric, so they are shared on purpose.
      expect(session.state.schematic.hiddenModes).toEqual([]);
      expect(session.state.schematic.width).toBe(300);
    }

    // The renderer was never told a new padding, and nothing was written to the
    // cartographic store — so no reframe and no reload on the way back.
    expect(viewportPaddingLeft.filter((value) => value !== 320)).toEqual([]);
    expect(rendererPaddingLeft()).toBe('320');
    expect(useVellumStore.getState()).toBe(storeBefore);

    act(() => {
      session.dispatch({ type: 'viewMode/toggle' });
    });
    expect(rendererPaddingLeft()).toBe('240');
  });
});

// Story 4.3, hueco cerrado en revisión: nada comprobaba que el id elegido
// produjera la geometría que nombra. Con una ciudad sin tránsito las tres
// estrategias devuelven el mismo layout vacío, así que mapear los tres ids a la
// estrategia geográfica —o intercambiar octilinear y orthoradial— dejaba la
// suite verde. Este test usa una red dibujable y compara los puntos realmente
// pintados contra la salida de cada estrategia.
describe('AppSurface — a layout id draws the geometry it names', () => {
  beforeEach(() => {
    useVellumStore.setState({
      cityData: transitFixture('simple'),
      loadingState: 'idle',
    });
  });

  // Scoped to the stroke group: since Story 4.3b the diagram also draws one
  // polyline per inner connection, and those are not `segments`.
  const drawnPoints = (): string[] =>
    [
      ...screen
        .getByTestId('schematic-diagram')
        .querySelectorAll('.schematic-view__segments polyline'),
    ]
      .map((node) => node.getAttribute('points') ?? '')
      .sort();

  const expectedPoints = (strategy: SchematicLayoutStrategy): string[] =>
    strategy(deriveTransitNetwork(transitFixture('simple')))
      .segments.map((segment) =>
        segment.points.map((p) => `${p.x},${p.y}`).join(' '),
      )
      .sort();

  it('renders each strategy and never two geometries at once', () => {
    render(<Harness />);
    act(() => {
      session.dispatch({ type: 'viewMode/toggle' });
    });

    const seen: string[][] = [];
    for (const [layoutId, strategy] of [
      ['geographic', geographicSchematicLayout],
      ['octilinear', octilinearSchematicLayout],
      ['orthoradial', orthoradialSchematicLayout],
    ] as const) {
      act(() => {
        session.dispatch({ type: 'schematic/setLayout', layoutId });
      });
      const drawn = drawnPoints();
      expect(drawn.length).toBeGreaterThan(0);
      expect(drawn).toEqual(expectedPoints(strategy));
      expect(screen.getAllByTestId('schematic-diagram')).toHaveLength(1);
      seen.push(drawn);
    }

    // Three ids, three distinct drawings: a record wired to one strategy three
    // times, or with two entries swapped, fails here.
    expect(new Set(seen.map((points) => points.join('|'))).size).toBe(3);
  });
});

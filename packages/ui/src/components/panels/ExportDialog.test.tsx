import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '../../test-utils';
import {
  composeMarginalia,
  paintMarginalia,
  resolveFullMapFraming,
  resolveFullMapOutputSurface,
  resolveMarginaliaFrame,
} from '@vellum/core';
import {
  makeCityData,
  makeExportPreviewSnapshot,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import { ExportDialog, type ExportDialogProps } from './ExportDialog';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';

const mockI18n = vi.hoisted(() => ({
  language: 'en',
  resolvedLanguage: 'en',
}));

const tMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: tMock,
    i18n: mockI18n,
  }),
}));

vi.mock('@vellum/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vellum/core')>();
  return {
    ...actual,
    composeMarginalia: vi.fn(actual.composeMarginalia),
    paintMarginalia: vi.fn(actual.paintMarginalia),
  };
});

const onOpenChange = vi.fn();
const onExport = vi.fn();
const onPreviewOptionsChange = vi.fn();

const preview = makeExportPreviewSnapshot({
  // Deliberately unlike `viewportSurface`: the preview image is rendered small
  // on purpose, and the dialog must never announce *its* size as the file's.
  dataUrl: 'data:image/png;base64,preview',
  width: 640,
  height: 480,
  viewportSurface: { width: 1200, height: 800 },
  bearingDegrees: 35,
  liveBearingDegrees: 35,
});

const cityData = makeCityData({
  cityName: 'Altavento',
  fileName: 'altavento.cslmap',
  generatedAt: '2026-07-27T12:00:00Z',
  roadSegments: [
    makeRoadSegment({ id: 'r1', itemClass: 'Highway' }),
    makeRoadSegment({ id: 'r2', itemClass: 'Small Road' }),
  ],
  transitLines: [makeTransitLine({ mode: 'Metro', name: 'Circular' })],
});

const defaultProps: ExportDialogProps = {
  open: true,
  cityData,
  defaultBackground: 'white',
  preview,
  onOpenChange,
  onPreviewOptionsChange,
  onExport,
};

function renderDialog(overrides: Partial<ExportDialogProps> = {}) {
  return render(<ExportDialog {...defaultProps} {...overrides} />);
}

describe('ExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockI18n.language = 'en';
    mockI18n.resolvedLanguage = 'en';
  });

  it('inicializa nombre, formato, área y fondo de forma determinista', () => {
    renderDialog();

    expect(screen.getByLabelText('export.fileName')).toHaveValue('Altavento');
    expect(screen.getByLabelText('export.format_png1x')).toBeChecked();
    expect(screen.getByLabelText('export.area_viewport')).toBeChecked();
    expect(screen.getByLabelText('export.background_white')).toBeChecked();
    expect(
      screen.getByRole('img', { name: 'export.preview' }),
    ).toBeInTheDocument();
  });

  it('expone una configuración compartida de presentación al exportar', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByLabelText('export.element_summary'));
    await user.type(screen.getByLabelText('export.element_author'), 'Ana');
    await user.click(screen.getByLabelText('export.corner_topRight'));
    await user.click(
      screen.getByRole('button', { name: 'export.exportButton' }),
    );

    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'png-1x',
        area: 'viewport',
        background: 'white',
        fileName: 'Altavento',
        presentation: {
          showCityName: true,
          showRoadLegend: false,
          showTransitLegend: false,
          showElevationLegend: false,
          showScaleBar: false,
          showOrientation: false,
          showSummary: true,
          showSourceNote: false,
          author: 'Ana',
          corner: 'top-right',
        },
        // Resolved here, in the active language; core never translates.
        labels: expect.objectContaining({
          north: 'export.marginalia_north',
          roadLegendTitle: 'export.legend_roadsTitle',
          transitMore: {
            one: 'export.legend_transitMoreOne',
            other: 'export.legend_transitMoreOther',
          },
        }),
      }),
    );
  });

  it('limita el autor a 60 caracteres', () => {
    renderDialog();
    expect(screen.getByLabelText('export.element_author')).toHaveAttribute(
      'maxLength',
      '60',
    );
  });

  it('sanitiza el nombre base y elimina una extensión conocida', async () => {
    const user = userEvent.setup();
    renderDialog();
    const input = screen.getByLabelText('export.fileName');

    await user.clear(input);
    await user.type(input, 'Aurelia/Delta?.png');
    await user.click(
      screen.getByRole('button', { name: 'export.exportButton' }),
    );

    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'AureliaDelta' }),
    );
  });

  it('normaliza extensiones residuales y nombres reservados de Windows', async () => {
    const user = userEvent.setup();
    renderDialog();
    const input = screen.getByLabelText('export.fileName');

    await user.clear(input);
    await user.type(input, 'foo.png.');
    await user.click(
      screen.getByRole('button', { name: 'export.exportButton' }),
    );
    expect(onExport).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileName: 'foo' }),
    );

    await user.clear(input);
    await user.type(input, 'CON');
    await user.click(
      screen.getByRole('button', { name: 'export.exportButton' }),
    );
    expect(onExport).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileName: '_CON' }),
    );
  });

  it('deshabilita Exportar con nombre vacío o exportación activa', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDialog();
    const input = screen.getByLabelText('export.fileName');

    await user.clear(input);
    expect(
      screen.getByRole('button', { name: 'export.exportButton' }),
    ).toBeDisabled();

    rerender(<ExportDialog {...defaultProps} isExporting />);
    expect(
      screen.getByRole('button', { name: 'export.exportButton' }),
    ).toBeDisabled();
  });

  it('Cancelar cierra sin ejecutar onExport', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole('button', { name: 'export.cancelButton' }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onExport).not.toHaveBeenCalled();
  });

  it('Escape cierra sin ejecutar onExport', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onExport).not.toHaveBeenCalled();
  });

  it('coloca el foco inicial en el nombre de archivo', () => {
    renderDialog();

    expect(screen.getByLabelText('export.fileName')).toHaveFocus();
  });

  it('reinicializa opciones al cerrar y volver a abrir', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDialog();
    await user.click(screen.getByLabelText('export.format_png4x'));
    await user.click(screen.getByLabelText('export.area_fullMap'));
    await user.click(screen.getByLabelText('export.background_dark'));
    await user.click(screen.getByLabelText('export.element_summary'));
    await user.click(screen.getByLabelText('export.corner_topLeft'));

    rerender(<ExportDialog {...defaultProps} open={false} />);
    rerender(<ExportDialog {...defaultProps} open />);

    expect(screen.getByLabelText('export.format_png1x')).toBeChecked();
    expect(screen.getByLabelText('export.area_viewport')).toBeChecked();
    expect(screen.getByLabelText('export.background_white')).toBeChecked();
    expect(screen.getByLabelText('export.element_summary')).not.toBeChecked();
    expect(screen.getByLabelText('export.corner_bottomLeft')).toBeChecked();
  });

  it('actualiza inmediatamente la presentación del preview', async () => {
    const user = userEvent.setup();
    renderDialog();
    const previewFrame = screen.getByTestId('export-preview');
    const canvas = screen.getByTestId('export-preview-marginalia');
    const before = Number(canvas.getAttribute('data-primitives'));

    await user.click(screen.getByLabelText('export.format_png4x'));
    await user.click(screen.getByLabelText('export.background_transparent'));
    await user.click(screen.getByLabelText('export.element_orientation'));

    expect(previewFrame).toHaveAttribute('data-format', 'png-4x');
    expect(previewFrame).toHaveAttribute('data-background', 'transparent');
    expect(Number(canvas.getAttribute('data-primitives'))).toBeGreaterThan(
      before,
    );
  });

  it('muestra presets de resolución para mapa completo y recalcula dimensiones', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByLabelText('export.area_fullMap'));

    expect(
      screen.getByRole('radio', { name: /export\.resolution_standard/ }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: /export\.resolution_high/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /export\.resolution_veryHigh/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /export\.resolution_maximum/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('export.format_png2x'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('export-output-dimensions')).toHaveTextContent(
      `${(6000).toLocaleString()} × ${(6000).toLocaleString()} px · ~40 MB`,
    );

    await user.click(
      screen.getByRole('radio', { name: /export\.resolution_veryHigh/ }),
    );

    expect(screen.getByTestId('export-output-dimensions')).toHaveTextContent(
      `${(16000).toLocaleString()} × ${(16000).toLocaleString()} px · ~282 MB`,
    );

    await user.click(screen.getByLabelText('export.area_viewport'));
    expect(screen.getByLabelText('export.format_png1x')).toBeChecked();
    expect(
      screen.queryByRole('radio', { name: /export\.resolution_standard/ }),
    ).not.toBeInTheDocument();
  });

  it('anuncia el tamaño real del archivo en viewport, no el de la imagen de preview', async () => {
    const user = userEvent.setup();
    renderDialog();

    // El canvas vivo mide 1200x800 y la imagen de preview 640x480. El archivo
    // que se escribe es el primero; leer el segundo hacía que el diálogo
    // anunciara "720 × 480 px" para un PNG que salía 1200x800.
    expect(screen.getByTestId('export-output-dimensions')).toHaveTextContent(
      `${(1200).toLocaleString()} × ${(800).toLocaleString()} px · ~1 MB`,
    );

    await user.click(screen.getByLabelText('export.format_png2x'));
    expect(screen.getByTestId('export-output-dimensions')).toHaveTextContent(
      `${(2400).toLocaleString()} × ${(1600).toLocaleString()} px · ~4 MB`,
    );

    await user.click(screen.getByLabelText('export.format_png4x'));
    expect(screen.getByTestId('export-output-dimensions')).toHaveTextContent(
      `${(4800).toLocaleString()} × ${(3200).toLocaleString()} px · ~17 MB`,
    );
  });

  it('no anuncia dimensiones para un viewport en SVG ni sin preview', () => {
    const { rerender } = renderDialog();
    rerender(<ExportDialog {...defaultProps} preview={null} />);
    expect(screen.queryByTestId('export-output-dimensions')).toBeNull();
  });

  it('descuenta el margen de marco para un full-map en SVG', async () => {
    const user = userEvent.setup();
    renderDialog({
      cityData: {
        ...cityData,
        bounds: {
          minX: -9000,
          maxX: 9000,
          minZ: -8000,
          maxZ: 8000,
          seaLevel: 40,
        },
      },
      // Norte arriba, para que la ruta vectorial esté disponible.
      preview: { ...preview, liveBearingDegrees: 0 },
    });

    await user.click(screen.getByLabelText('export.area_fullMap'));
    // Raster: el extent crece con el margen del marco, así que el lado corto
    // sube de 5333 a 5346.
    expect(screen.getByTestId('export-output-dimensions')).toHaveTextContent(
      `${(6000).toLocaleString()} × ${(5346).toLocaleString()} px`,
    );

    await user.click(screen.getByLabelText('export.format_svg'));
    // El documento vectorial no dibuja marco, así que `buildSvgExportSnapshot`
    // no reserva margen: reportar el número raster describiría otro archivo.
    expect(screen.getByTestId('export-output-dimensions')).toHaveTextContent(
      `${(6000).toLocaleString()} × ${(5333).toLocaleString()} px`,
    );
  });

  it('retira SVG con el mapa rotado aunque el área sea full-map', async () => {
    const user = userEvent.setup();
    renderDialog({
      preview: { ...preview, bearingDegrees: 0, liveBearingDegrees: 35 },
    });

    // La preview de full-map se renderiza siempre al norte, así que su propio
    // bearing es 0; el exportador vectorial juzga la cámara viva, que sigue
    // rotada. Leer el primero volvía a ofrecer SVG para rechazarlo después.
    await user.click(screen.getByLabelText('export.area_fullMap'));
    expect(screen.getByLabelText('export.format_svg')).toBeDisabled();
  });

  it('señala que hay una preview renderizándose sin borrar la anterior', () => {
    const { rerender } = renderDialog();
    expect(screen.queryByTestId('export-preview-loading')).toBeNull();

    rerender(<ExportDialog {...defaultProps} isPreviewLoading />);

    // La imagen previa sigue visible: es lo más parecido a la respuesta
    // mientras la nueva se renderiza, y vaciarla haría parpadear el diálogo.
    expect(screen.getByTestId('export-preview-loading')).toBeInTheDocument();
    expect(
      screen.getByTestId('export-preview').querySelector('img'),
    ).toHaveAttribute('src', 'data:image/png;base64,preview');
    expect(screen.getByTestId('export-preview')).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('formatea el preview con el idioma seleccionado en la app', async () => {
    const user = userEvent.setup();
    mockI18n.language = 'es';
    mockI18n.resolvedLanguage = 'es';
    renderDialog();

    await user.click(screen.getByLabelText('export.area_fullMap'));
    await user.click(
      screen.getByRole('radio', { name: /export\.resolution_high/ }),
    );

    expect(screen.getByTestId('export-output-dimensions')).toHaveTextContent(
      '12.000 × 12.000 px · ~158 MB',
    );
  });

  it('envía targetLongEdge para un export de mapa completo', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByLabelText('export.area_fullMap'));
    await user.click(
      screen.getByRole('radio', { name: /export\.resolution_high/ }),
    );
    await user.click(
      screen.getByRole('button', { name: 'export.exportButton' }),
    );

    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({
        area: 'full-map',
        format: 'png-1x',
        targetLongEdge: 12000,
      }),
    );
  });

  it('muestra la captura tal cual, sin atenuarla para simular el fondo', async () => {
    const user = userEvent.setup();
    renderDialog();
    const image = screen.getByTestId('export-preview').querySelector('img');

    // La captura ya trae el fondo real; bajarle la opacidad para dejar
    // asomar un color CSS sería fingir una diferencia que el archivo no tiene.
    // Se asserta la AUSENCIA de opacidad inline, no un valor concreto: un
    // `not.toHaveStyle({ opacity: '0.9' })` pasaría igual con un 0.7 nuevo.
    expect(image?.style.opacity).toBe('');
    await user.click(screen.getByLabelText('export.background_transparent'));
    expect(image?.style.opacity).toBe('');
  });

  it('pide la primera preview al abrirse, con la composición que restaura', () => {
    const { rerender } = renderDialog({ open: false });
    expect(onPreviewOptionsChange).not.toHaveBeenCalled();

    rerender(<ExportDialog {...defaultProps} open />);

    // La preview inicial también nace de un `ExportSnapshot`: el diálogo pide
    // exactamente las opciones que acaba de restaurar, en lugar de heredar una
    // lectura del canvas vivo que ya podría diferir del archivo.
    expect(onPreviewOptionsChange).toHaveBeenCalledExactlyOnceWith({
      area: 'viewport',
      background: 'white',
    });
  });

  it('la apertura respeta el fondo derivado del tema activo', () => {
    const { rerender } = renderDialog({
      open: false,
      defaultBackground: 'dark',
    });
    rerender(<ExportDialog {...defaultProps} defaultBackground="dark" open />);

    expect(onPreviewOptionsChange).toHaveBeenCalledExactlyOnceWith({
      area: 'viewport',
      background: 'dark',
    });
  });

  it('pide una recaptura al cambiar el área y al cambiar el fondo', async () => {
    const user = userEvent.setup();
    renderDialog();
    // La captura de apertura ya se pidió al montar con `open`.
    expect(onPreviewOptionsChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText('export.area_fullMap'));
    expect(onPreviewOptionsChange).toHaveBeenLastCalledWith({
      area: 'full-map',
      background: 'white',
    });

    await user.click(screen.getByLabelText('export.background_transparent'));
    expect(onPreviewOptionsChange).toHaveBeenLastCalledWith({
      area: 'full-map',
      background: 'transparent',
    });
    expect(onPreviewOptionsChange).toHaveBeenCalledTimes(3);
  });

  it('no pide recaptura por opciones que no cambian lo dibujado', async () => {
    const user = userEvent.setup();
    renderDialog();
    onPreviewOptionsChange.mockClear();

    // Densidad, resolución, nombre de archivo y marginalia decoran el diálogo;
    // ninguna cambia la imagen capturada, así que no justifican un render.
    await user.click(screen.getByLabelText('export.format_png2x'));
    await user.click(screen.getByLabelText('export.element_scaleBar'));
    await user.type(screen.getByLabelText('export.element_author'), 'Ana');
    await user.click(screen.getByLabelText('export.corner_topRight'));
    expect(onPreviewOptionsChange).not.toHaveBeenCalled();

    // Reelegir el área que ya estaba activa tampoco es un cambio.
    await user.click(screen.getByLabelText('export.area_viewport'));
    expect(onPreviewOptionsChange).not.toHaveBeenCalled();
  });

  it('pinta el layout de la superficie final escalado, no un layout propio', async () => {
    const user = userEvent.setup();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(
        new Proxy(
          {},
          {
            get: (_target, key) =>
              key === 'createLinearGradient'
                ? () => ({ addColorStop: () => undefined })
                : () => undefined,
            set: () => true,
          },
        ) as unknown as CanvasRenderingContext2D,
      );
    const rect = vi
      .spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 480, height: 320 } as DOMRect);
    renderDialog();

    await user.click(screen.getByLabelText('export.format_png2x'));
    await user.click(screen.getByLabelText('export.element_scaleBar'));

    // Viewport 1200×800 at 2x: the layout is the 2400×1600 file's.
    const [, frame] = vi.mocked(composeMarginalia).mock.lastCall!;
    expect(frame.surface).toEqual({ width: 2400, height: 1600 });
    expect(frame.worldUnitsPerPixel).toBeCloseTo(2);
    await waitFor(() => {
      const [, layout, transform] = vi.mocked(paintMarginalia).mock.lastCall!;
      expect(layout.surface).toEqual({ width: 2400, height: 1600 });
      expect(transform.scale).toBeCloseTo(
        (480 * (window.devicePixelRatio || 1)) / 2400,
      );
    });
    getContext.mockRestore();
    rect.mockRestore();
  });

  it('avisa cuando la marginalia no cabe y se omiten bloques', async () => {
    const user = userEvent.setup();
    renderDialog({
      preview: {
        ...preview,
        liveBearingDegrees: 0,
        viewportSurface: { width: 200, height: 40 },
      },
    });
    for (const label of [
      'export.element_roadLegend',
      'export.element_transitLegend',
      'export.element_elevationLegend',
      'export.element_scaleBar',
      'export.element_summary',
      'export.element_sourceNote',
    ]) {
      await user.click(screen.getByLabelText(label));
    }

    const warning = screen.getByTestId('export-marginalia-omitted');
    expect(warning.getAttribute('data-omitted')).toContain('source-note');
    // The notice names what was dropped, in the active language.
    expect(tMock).toHaveBeenCalledWith('export.marginaliaOmitted', {
      blocks: expect.stringContaining('export.block_sourceNote'),
    });
  });

  it('evita combinaciones de escala imposibles al seleccionar SVG', async () => {
    const user = userEvent.setup();
    // La cámara viva del preview por defecto está rotada 35°, que deshabilita
    // SVG:
    // este caso prueba la lógica de escala, no la elegibilidad de cámara.
    renderDialog({
      preview: { ...defaultProps.preview!, liveBearingDegrees: 0 },
    });

    await user.click(screen.getByLabelText('export.format_svg'));

    expect(screen.getByTestId('export-preview')).toHaveAttribute(
      'data-format',
      'svg',
    );
    expect(screen.queryByText('export.scale_4x')).toBeNull();
  });

  it('deshabilita SVG mientras la cámara está rotada, con una razón accionable', async () => {
    const user = userEvent.setup();
    // AC 19: una ruta no elegible vuelve a estado deshabilitado, en vez de
    // dejarse elegir y fallar recién al confirmar la exportación.
    renderDialog({
      preview: { ...defaultProps.preview!, liveBearingDegrees: 35 },
    });

    const svg = screen.getByLabelText('export.format_svg');
    expect(svg).toBeDisabled();
    expect(svg.closest('label')).toHaveAttribute(
      'title',
      'errors.SvgExportUnsupportedCamera',
    );

    await user.click(svg);
    expect(screen.getByTestId('export-preview')).toHaveAttribute(
      'data-format',
      'png-1x',
    );
  });

  it('vuelve a ofrecer SVG cuando la cámara regresa a norte arriba', () => {
    renderDialog({
      preview: { ...defaultProps.preview!, liveBearingDegrees: 0 },
    });
    expect(screen.getByLabelText('export.format_svg')).toBeEnabled();
  });

  it('deshabilita con motivo lo que el mapa no puede respaldar', async () => {
    const user = userEvent.setup();
    renderDialog({
      cityData: { ...cityData, transitLines: [] },
      preview: {
        ...preview,
        livePitchDegrees: 30,
        activeLayers: { ...preview.activeLayers, roads: false },
      },
    });

    const road = screen.getByLabelText('export.element_roadLegend');
    expect(road).toBeDisabled();
    expect(road.closest('label')).toHaveAttribute(
      'title',
      'export.unavailable_layerHidden',
    );
    expect(
      screen.getByLabelText('export.element_transitLegend'),
    ).toBeDisabled();
    expect(
      screen.getByLabelText('export.element_transitLegend').closest('label'),
    ).toHaveAttribute('title', 'export.unavailable_noData');
    const scale = screen.getByLabelText('export.element_scaleBar');
    expect(scale).toBeDisabled();
    expect(scale.closest('label')).toHaveTextContent(
      'export.unavailable_cameraPitch',
    );
    expect(
      screen.getByLabelText('export.element_elevationLegend'),
    ).toBeEnabled();

    // Full-map is always rendered flat, so the scale bar comes back.
    await user.click(screen.getByLabelText('export.area_fullMap'));
    expect(screen.getByLabelText('export.element_scaleBar')).toBeEnabled();
  });
});

describe('ExportDialog — revisión 3.5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sin preview, escala y orientación quedan no disponibles', () => {
    renderDialog({ preview: null });
    for (const label of [
      'export.element_scaleBar',
      'export.element_orientation',
    ]) {
      const input = screen.getByLabelText(label);
      expect(input).toBeDisabled();
      expect(input.closest('label')).toHaveAttribute(
        'title',
        'export.unavailable_noData',
      );
    }
  });

  it('no deforma la imagen: usa el aspecto del documento solo si coincide con el de la imagen', async () => {
    const user = userEvent.setup();
    // Image 720×480 (1.5) matches the 1200×800 document.
    const { rerender } = renderDialog({
      preview: { ...preview, width: 720, height: 480, liveBearingDegrees: 0 },
    });
    expect(screen.getByTestId('export-preview').style.aspectRatio).toBe(
      '1200 / 800',
    );

    // A stale 640×480 image (1.333) keeps its own proportions.
    rerender(<ExportDialog {...defaultProps} />);
    expect(screen.getByTestId('export-preview').style.aspectRatio).toBe(
      '640 / 480',
    );
    await user.click(screen.getByLabelText('export.format_png2x'));
    expect(screen.getByTestId('export-preview').style.aspectRatio).toBe(
      '640 / 480',
    );
  });

  it.each(['png-1x', 'svg'] as const)(
    'full-map %s: el frame es el de las funciones de encuadre del exportador',
    async (format) => {
      const user = userEvent.setup();
      renderDialog({ preview: { ...preview, liveBearingDegrees: 0 } });

      await user.click(screen.getByLabelText('export.area_fullMap'));
      if (format === 'svg') {
        await user.click(screen.getByLabelText('export.format_svg'));
      }
      await user.click(
        screen.getByRole('radio', { name: /export\.resolution_high/ }),
      );

      const { bounds } = cityData;
      const framing =
        format === 'svg'
          ? {
              extent: bounds,
              surface: resolveFullMapOutputSurface(bounds, 12000),
            }
          : resolveFullMapFraming(bounds, 12000);
      const expected = resolveMarginaliaFrame({
        area: 'full-map',
        format,
        surface: framing.surface,
        extent: framing.extent,
        viewportWorldUnitsPerPixel: 0,
        camera: { bearing: 0, pitch: 0 },
      });
      const [, frame] = vi.mocked(composeMarginalia).mock.lastCall!;
      expect(frame).toEqual(expected);
      // The vector document has no map frame, so no frame margin either.
      expect(frame.hasMapFrame).toBe(format !== 'svg');
    },
  );
});

describe('ExportDialog translations', () => {
  it('mantiene todas las claves export espejo en inglés y español', () => {
    expect(Object.keys(es.export).sort()).toEqual(
      Object.keys(en.export).sort(),
    );
    expect(en.export.format_png1x).not.toBe('export.format_png1x');
    expect(es.export.element_orientation).not.toBe(
      'export.element_orientation',
    );
  });
});

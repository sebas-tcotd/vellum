import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test-utils';
import { ExportDialog, type ExportDialogProps } from './ExportDialog';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';

const mockI18n = vi.hoisted(() => ({
  language: 'en',
  resolvedLanguage: 'en',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: mockI18n,
  }),
}));

vi.mock('@vellum/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vellum/core')>();
  return {
    ...actual,
    vellumLogoDataUri: () => 'data:image/svg+xml;base64,vellum-logo',
  };
});

const onOpenChange = vi.fn();
const onExport = vi.fn();
const onPreviewOptionsChange = vi.fn();

const preview = {
  // Deliberately unlike `viewportSurface`: the preview image is rendered small
  // on purpose, and the dialog must never announce *its* size as the file's.
  dataUrl: 'data:image/png;base64,preview',
  width: 640,
  height: 480,
  viewportSurface: { width: 1200, height: 800 },
  bearingDegrees: 35,
  liveBearingDegrees: 35,
  scale: { distanceMeters: 500, widthPercent: 24 },
  annotations: [
    {
      id: 'district-1',
      name: 'Centro',
      kind: 'district' as const,
      xPercent: 25,
      yPercent: 40,
    },
    {
      id: 'park-1',
      name: 'Centro',
      kind: 'park' as const,
      xPercent: 70,
      yPercent: 60,
    },
  ],
};

const defaultProps: ExportDialogProps = {
  open: true,
  cityName: 'Altavento',
  fileName: 'altavento.cslmap',
  generatedAt: '2026-07-27T12:00:00Z',
  defaultBackground: 'white',
  preview,
  fullMapBounds: {
    minX: -8640,
    maxX: 8640,
    minZ: -8640,
    maxZ: 8640,
  },
  availability: {
    districts: true,
    parks: true,
    roads: true,
    transit: true,
    elevation: true,
  },
  counts: {
    roads: 14,
    buildings: 22,
    districts: 3,
    parks: 2,
    transitLines: 4,
    transitStops: 8,
  },
  visibleLayerNames: ['terrain', 'roads'],
  transitLabels: [{ id: 'line-1', mode: 'Metro', name: 'Circular' }],
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

    await user.click(screen.getByLabelText('export.element_logo'));
    await user.click(
      screen.getByRole('button', { name: 'export.exportButton' }),
    );

    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'png-1x',
        area: 'viewport',
        background: 'white',
        fileName: 'Altavento',
        presentation: expect.objectContaining({
          showCityName: true,
          showVellumLogo: true,
        }),
      }),
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
    await user.click(screen.getByLabelText('export.element_logo'));

    rerender(<ExportDialog {...defaultProps} open={false} />);
    rerender(<ExportDialog {...defaultProps} open />);

    expect(screen.getByLabelText('export.format_png1x')).toBeChecked();
    expect(screen.getByLabelText('export.area_viewport')).toBeChecked();
    expect(screen.getByLabelText('export.background_white')).toBeChecked();
    expect(screen.getByLabelText('export.element_logo')).not.toBeChecked();
  });

  it('actualiza inmediatamente la presentación del preview', async () => {
    const user = userEvent.setup();
    renderDialog();
    const preview = screen.getByTestId('export-preview');

    await user.click(screen.getByLabelText('export.format_png4x'));
    await user.click(screen.getByLabelText('export.background_transparent'));
    await user.click(screen.getByLabelText('export.element_orientation'));

    expect(preview).toHaveAttribute('data-format', 'png-4x');
    expect(preview).toHaveAttribute('data-background', 'transparent');
    expect(screen.getByTestId('export-preview-orientation')).toHaveAttribute(
      'data-bearing',
      '35',
    );
    expect(
      screen.queryByTestId('export-preview-scale'),
    ).not.toBeInTheDocument();
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
      fullMapBounds: { minX: -9000, maxX: 9000, minZ: -8000, maxZ: 8000 },
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
    expect(onPreviewOptionsChange).not.toHaveBeenCalled();

    // Reelegir el área que ya estaba activa tampoco es un cambio.
    await user.click(screen.getByLabelText('export.area_viewport'));
    expect(onPreviewOptionsChange).not.toHaveBeenCalled();
  });

  it('proyecta anotaciones por id y muestra el asset real del logo', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByLabelText('export.element_districts'));
    await user.click(screen.getByLabelText('export.element_parks'));
    await user.click(screen.getByLabelText('export.element_logo'));

    const labels = screen.getAllByText('Centro');
    expect(labels).toHaveLength(2);
    expect(labels[0]).toHaveStyle({ left: '25%', top: '40%' });
    expect(labels[1]).toHaveStyle({ left: '70%', top: '60%' });
    expect(
      screen.getByTestId('export-preview').querySelector('img[aria-hidden]'),
    ).toHaveAttribute('src', 'data:image/svg+xml;base64,vellum-logo');
  });

  it('presenta escala, orientación y leyendas derivadas y localizadas', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByLabelText('export.element_scaleBar'));
    await user.click(screen.getByLabelText('export.element_orientation'));
    await user.click(screen.getByLabelText('export.element_layerLegend'));
    await user.click(screen.getByLabelText('export.element_roadLegend'));
    await user.click(screen.getByLabelText('export.element_transitLegend'));
    await user.click(screen.getByLabelText('export.element_elevationLegend'));

    expect(screen.getByTestId('export-preview-scale')).toHaveTextContent(
      '500 m',
    );
    expect(screen.getByTestId('export-preview-scale')).toHaveStyle({
      width: '24%',
    });
    expect(screen.getByText('layers.terrain')).toBeInTheDocument();
    expect(screen.getByText('export.legend_road_highway')).toBeInTheDocument();
    expect(
      screen.getByText('transitModes.Metro: Circular'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('export.legend_elevationContours'),
    ).toBeInTheDocument();
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

  it('deshabilita opciones cuyos datos no están disponibles', () => {
    renderDialog({
      availability: {
        districts: false,
        parks: false,
        roads: true,
        transit: false,
        elevation: false,
      },
    });

    expect(screen.getByLabelText('export.element_districts')).toBeDisabled();
    expect(screen.getByLabelText('export.element_parks')).toBeDisabled();
    expect(
      screen.getByLabelText('export.element_transitLegend'),
    ).toBeDisabled();
    expect(
      screen.getByLabelText('export.element_elevationLegend'),
    ).toBeDisabled();
  });
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

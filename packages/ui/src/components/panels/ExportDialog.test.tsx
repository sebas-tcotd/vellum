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

const preview = {
  dataUrl: 'data:image/png;base64,preview',
  width: 640,
  height: 480,
  bearingDegrees: 35,
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

  it('hace visible el fondo seleccionado bajo la captura opaca', async () => {
    const user = userEvent.setup();
    renderDialog();
    const image = screen.getByTestId('export-preview').querySelector('img');

    expect(image).toHaveStyle({ opacity: '0.9' });
    await user.click(screen.getByLabelText('export.background_transparent'));
    expect(image).toHaveStyle({ opacity: '0.78' });
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
    // El preview por defecto está rotado 35°, que ahora deshabilita SVG:
    // este caso prueba la lógica de escala, no la elegibilidad de cámara.
    renderDialog({
      preview: { ...defaultProps.preview!, bearingDegrees: 0 },
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
      preview: { ...defaultProps.preview!, bearingDegrees: 35 },
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
      preview: { ...defaultProps.preview!, bearingDegrees: 0 },
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

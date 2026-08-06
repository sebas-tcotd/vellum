import type { ExportResult, VellumError } from '@vellum/core';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test-utils';
import { ExportStatusOverlay } from './ExportStatusOverlay';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const IDLE = {
  isExporting: false,
  exportPhase: 'idle',
  exportProgress: null,
  exportResult: null,
  exportCancelled: false,
  exportError: null,
  exportWarnings: [],
  onCancelExport: vi.fn(),
} as const;

const RESULT: ExportResult = {
  filePath: '/tmp/city.svg',
  folderPath: '/tmp',
};

describe('ExportStatusOverlay — advertencias de exportación parcial', () => {
  it('anuncia las advertencias junto al toast de éxito', () => {
    // Una exportación que omitió algo que el usuario pidió no es un éxito
    // limpio: el archivo existe, pero no es el que se configuró.
    render(
      <ExportStatusOverlay
        {...IDLE}
        exportResult={RESULT}
        exportWarnings={['exportWarnings.svgUnsupportedPresentation']}
      />,
    );

    expect(screen.getByText('export.successToast')).toBeInTheDocument();
    expect(
      screen.getByText('exportWarnings.svgUnsupportedPresentation'),
    ).toBeInTheDocument();
  });

  it('no muestra nada cuando la exportación no omitió nada', () => {
    render(<ExportStatusOverlay {...IDLE} exportResult={RESULT} />);

    expect(screen.getByText('export.successToast')).toBeInTheDocument();
    expect(
      screen.queryByText('exportWarnings.svgUnsupportedPresentation'),
    ).toBeNull();
  });

  it('renderiza cada advertencia como su propia clave, sin concatenarlas', () => {
    // Concatenar produciría una cadena que ningún archivo de traducción tiene.
    render(
      <ExportStatusOverlay
        {...IDLE}
        exportResult={RESULT}
        exportWarnings={[
          'exportWarnings.svgEmptyLayer',
          'exportWarnings.svgDegenerateGeometry',
        ]}
      />,
    );

    expect(
      screen.getByText('exportWarnings.svgEmptyLayer'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('exportWarnings.svgDegenerateGeometry'),
    ).toBeInTheDocument();
  });

  it('acompaña también a un fallo, porque el aviso sigue siendo cierto', () => {
    // El motivo por el que algo no se iba a renderizar no deja de aplicar
    // porque además la exportación fallara.
    const error: VellumError = { type: 'IoError', reason: 'disk full' };
    render(
      <ExportStatusOverlay
        {...IDLE}
        exportError={error}
        exportWarnings={['exportWarnings.svgUnsupportedPresentation']}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText('exportWarnings.svgUnsupportedPresentation'),
    ).toBeInTheDocument();
  });

  it('no anuncia advertencias mientras la exportación sigue en curso', () => {
    // Todavía no se omitió nada: el aviso pertenece al desenlace, no al
    // progreso, y mostrarlo antes lo convertiría en ruido permanente.
    render(
      <ExportStatusOverlay
        {...IDLE}
        isExporting
        exportPhase="exporting"
        exportWarnings={['exportWarnings.svgUnsupportedPresentation']}
      />,
    );

    expect(
      screen.queryByText('exportWarnings.svgUnsupportedPresentation'),
    ).toBeNull();
  });
});

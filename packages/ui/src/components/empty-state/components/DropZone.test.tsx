import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test-utils';
import { DropZone } from './DropZone';

describe('DropZone — semántica', () => {
  it('tiene role="region"', () => {
    render(<DropZone label="Zona de drop">Contenido</DropZone>);
    expect(screen.getByRole('region')).toBeDefined();
  });

  it('expone el aria-label recibido por prop', () => {
    render(<DropZone label="Arrastra tu mapa aquí">Contenido</DropZone>);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Arrastra tu mapa aquí',
    );
  });
});

describe('DropZone — renderizado', () => {
  it('muestra el contenido de children', () => {
    render(
      <DropZone label="Zona">
        <span>Hijo</span>
      </DropZone>,
    );
    expect(screen.getByText('Hijo')).toBeDefined();
  });

  it('acepta múltiples children', () => {
    render(
      <DropZone label="Zona">
        <span>Primero</span>
        <span>Segundo</span>
      </DropZone>,
    );
    expect(screen.getByText('Primero')).toBeDefined();
    expect(screen.getByText('Segundo')).toBeDefined();
  });
});

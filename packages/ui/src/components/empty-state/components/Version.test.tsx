import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test-utils';
import { AppMetaProvider } from '../../../context/AppMetaContext';
import { Version } from './Version';

function renderWithMeta(version: string) {
  return render(
    <AppMetaProvider version={version}>
      <Version />
    </AppMetaProvider>,
  );
}

describe('Version — renderizado', () => {
  it('muestra la versión recibida del contexto', () => {
    renderWithMeta('1.2.3');
    expect(screen.getByText('v1.2.3')).toBeDefined();
  });

  it('antepone el prefijo "v" a la versión', () => {
    renderWithMeta('0.1.0');
    expect(screen.getByText(/^v/)).toHaveTextContent('v0.1.0');
  });

  it('renderiza un <span>', () => {
    renderWithMeta('0.1.0');
    expect(screen.getByText('v0.1.0').tagName).toBe('SPAN');
  });
});

describe('Version — contrato de contexto', () => {
  it('lanza si se usa fuera de AppMetaProvider', () => {
    // Silenciamos el error de React en consola para mantener la salida limpia
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Version />)).toThrow();
    consoleSpy.mockRestore();
  });
});

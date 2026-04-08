import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test-utils';
import { ContextualHint } from './ContextualHint';

describe('ContextualHint — renderizado', () => {
  it('muestra el contenido de children', () => {
    render(<ContextualHint phase="visible">Texto de hint</ContextualHint>);
    expect(screen.getByRole('status')).toHaveTextContent('Texto de hint');
  });

  it('tiene role="status" para screen readers', () => {
    render(<ContextualHint phase="visible">Hint</ContextualHint>);
    expect(screen.getByRole('status')).toBeDefined();
  });
});

describe('ContextualHint — accesibilidad', () => {
  it('aria-hidden es false cuando phase="visible"', () => {
    render(<ContextualHint phase="visible">Hint</ContextualHint>);
    expect(screen.getByRole('status')).toHaveAttribute('aria-hidden', 'false');
  });

  it('aria-hidden es true cuando phase="leaving"', () => {
    render(<ContextualHint phase="leaving">Hint</ContextualHint>);
    expect(screen.getByRole('status', { hidden: true })).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

describe('ContextualHint — animación', () => {
  it('aplica la animación de entrada cuando phase="visible"', () => {
    render(<ContextualHint phase="visible">Hint</ContextualHint>);
    expect(screen.getByRole('status')).toHaveStyle({
      animation: 'vellum-hint-fadein 300ms ease forwards',
    });
  });

  it('aplica la animación de salida cuando phase="leaving"', () => {
    render(<ContextualHint phase="leaving">Hint</ContextualHint>);
    expect(screen.getByRole('status', { hidden: true })).toHaveStyle({
      animation: 'vellum-hint-fadeout 300ms ease forwards',
    });
  });
});

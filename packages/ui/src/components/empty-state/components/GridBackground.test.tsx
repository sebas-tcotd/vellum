import { describe, it, expect } from 'vitest';
import { render } from '../../../test-utils';
import { GridBackground } from './GridBackground';

describe('GridBackground — accesibilidad', () => {
  it('está oculto a los screen readers (aria-hidden)', () => {
    const { container } = render(<GridBackground />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('no intercepta eventos de puntero (pointer-events-none)', () => {
    const { container } = render(<GridBackground />);
    // La clase Tailwind pointer-events-none genera pointer-events: none
    expect(container.firstChild).toHaveClass('pointer-events-none');
  });
});

describe('GridBackground — renderizado', () => {
  it('aplica el patrón SVG como backgroundImage', () => {
    const { container } = render(<GridBackground />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundImage).toContain('data:image/svg+xml');
  });

  it('aplica un backgroundSize de 40px × 40px', () => {
    const { container } = render(<GridBackground />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundSize).toBe('40px 40px');
  });
});

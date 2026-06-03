import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test-utils';
import { LayerToggleRow } from './LayerToggleRow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('LayerToggleRow', () => {
  it('renderiza la clave i18n como label de la capa', () => {
    render(
      <LayerToggleRow
        layer="water"
        visible={true}
        onToggle={vi.fn()}
        color="#6db8b7"
      />,
    );
    expect(screen.getByText('layers.water')).toBeDefined();
  });

  it('refleja el estado visible=true en el switch', () => {
    render(
      <LayerToggleRow
        layer="terrain"
        visible={true}
        onToggle={vi.fn()}
        color="#deddbe"
      />,
    );
    const switchEl = screen.getByRole('switch');
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
  });

  it('refleja el estado visible=false en el switch', () => {
    render(
      <LayerToggleRow
        layer="roads"
        visible={false}
        onToggle={vi.fn()}
        color="#d2938e"
      />,
    );
    const switchEl = screen.getByRole('switch');
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
  });

  it('llama onToggle con la capa y el nuevo estado al hacer click', () => {
    const onToggle = vi.fn();
    render(
      <LayerToggleRow
        layer="forests"
        visible={false}
        onToggle={onToggle}
        color="#95ae79"
      />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('forests', true);
  });

  it('tiene aria-label con el nombre de la capa', () => {
    render(
      <LayerToggleRow
        layer="districts"
        visible={true}
        onToggle={vi.fn()}
        color="#b4a08c"
      />,
    );
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe(
      'layers.districts',
    );
  });

  it('aplica opacity 0.4 al dot en theme transit', () => {
    const { container } = render(
      <LayerToggleRow
        layer="transit"
        visible={true}
        onToggle={vi.fn()}
        color="#a098b0"
        theme="transit"
      />,
    );
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot.style.opacity).toBe('0.4');
  });

  it('aplica opacity 1 al dot en theme day (por defecto)', () => {
    const { container } = render(
      <LayerToggleRow
        layer="buildings"
        visible={true}
        onToggle={vi.fn()}
        color="#c8bfb5"
      />,
    );
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot.style.opacity).toBe('1');
  });

  it('tiene altura mínima de 32px', () => {
    const { container } = render(
      <LayerToggleRow
        layer="water"
        visible={true}
        onToggle={vi.fn()}
        color="#6db8b7"
      />,
    );
    const row = container.firstChild as HTMLElement;
    expect(row.style.minHeight).toBe('32px');
  });
});

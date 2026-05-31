import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test-utils';
import { PartialParseDialog } from './PartialParseDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock Radix UI Dialog to avoid portal/DOM complexity in jsdom
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? (
      <div role="dialog" aria-modal="true">
        {children}
      </div>
    ) : null,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Overlay: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Content: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  Header: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Footer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Title: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
  Description: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  Close: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const defaultError = {
  type: 'PartialParse' as const,
  warnings: ['section error'],
};

describe('PartialParseDialog', () => {
  it('muestra título y descripción localizados', () => {
    render(
      <PartialParseDialog
        error={defaultError}
        onPartialRender={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('errors.partialParseTitle')).toBeDefined();
    expect(screen.getByText('errors.partialParseDescription')).toBeDefined();
  });

  it('muestra los warnings del error al usuario', () => {
    render(
      <PartialParseDialog
        error={{
          type: 'PartialParse',
          warnings: ['section header failed', 'section roads failed'],
        }}
        onPartialRender={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('section header failed')).toBeDefined();
    expect(screen.getByText('section roads failed')).toBeDefined();
  });

  it('no muestra lista de warnings cuando el array está vacío', () => {
    render(
      <PartialParseDialog
        error={{ type: 'PartialParse', warnings: [] }}
        onPartialRender={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('llama onPartialRender al hacer click en "Intentar renderizado parcial"', () => {
    const onPartialRender = vi.fn();
    render(
      <PartialParseDialog
        error={defaultError}
        onPartialRender={onPartialRender}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /errors\.tryPartialRender/i }),
    );
    expect(onPartialRender).toHaveBeenCalledOnce();
  });

  it('llama onCancel al hacer click en Cancelar', () => {
    const onCancel = vi.fn();
    render(
      <PartialParseDialog
        error={defaultError}
        onPartialRender={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

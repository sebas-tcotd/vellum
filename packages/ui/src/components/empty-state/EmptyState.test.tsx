import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '../../test-utils';
import { AppMetaProvider } from '../../context/AppMetaContext';
import { EmptyState } from './EmptyState';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderEmptyState() {
  return render(
    <AppMetaProvider version="0.0.0">
      <EmptyState />
    </AppMetaProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('EmptyState — composición i18n', () => {
  it('exposes native buttons, a named thumbnail and both desktop callbacks', () => {
    const onOpenFile = vi.fn();
    const onOpenSampleCity = vi.fn();
    render(
      <AppMetaProvider version="0.0.0">
        <EmptyState
          sampleCity={{
            name: 'Aurelia del Delta',
            thumbnailUrl: '/sample-city.webp',
          }}
          onOpenFile={onOpenFile}
          onOpenSampleCity={onOpenSampleCity}
        />
      </AppMetaProvider>,
    );
    const open = screen.getByRole('button', { name: 'emptyState.openFile' });
    const sample = screen.getByRole('button', {
      name: 'emptyState.openSampleCity',
    });
    open.focus();
    expect(open).toHaveFocus();
    sample.focus();
    expect(sample).toHaveFocus();
    fireEvent.click(open);
    fireEvent.click(sample);
    expect(onOpenFile).toHaveBeenCalledOnce();
    expect(onOpenSampleCity).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('img', { name: 'emptyState.sampleThumbnail' }),
    ).toHaveAttribute('src', '/sample-city.webp');
    expect(screen.getByText('Aurelia del Delta')).toBeVisible();
  });
  it('renderiza el wordmark con la clave emptyState.title', () => {
    renderEmptyState();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'emptyState.title',
    );
  });

  it('renderiza el atajo de teclado junto al texto de apertura', () => {
    renderEmptyState();
    expect(screen.getByText('emptyState.orOpenWith')).toBeDefined();
    expect(screen.getByText('Ctrl + O')).toBeDefined();
  });

  it('pasa emptyState.dropHint como aria-label a la zona de drop', () => {
    renderEmptyState();
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'emptyState.dropHint',
    );
  });

  it('la zona de drop contiene el texto de hint y el atajo', () => {
    renderEmptyState();
    const region = screen.getByRole('region');
    expect(region).toHaveTextContent('emptyState.dropHint');
    expect(region).toHaveTextContent('emptyState.orOpenWith');
    expect(region).toHaveTextContent('Ctrl + O');
  });
});

describe('EmptyState — renderizado condicional del hint', () => {
  it('el hint no está en el DOM al montar', () => {
    renderEmptyState();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('el hint se monta en el DOM tras 4000ms en la primera sesión', () => {
    renderEmptyState();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'emptyState.firstUseHint',
    );
  });

  it('el hint se desmonta del DOM 300ms después de un dragenter', () => {
    renderEmptyState();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => {
      window.dispatchEvent(new Event('dragenter'));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
  });
});

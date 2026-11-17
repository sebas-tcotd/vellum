// packages/ui/src/components/overlays/CrashBoundary.test.tsx
// Real i18next, no mock: the fallback must resolve its copy in both languages,
// and a key missing from es.json would otherwise fall back to English silently.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test-utils';
import { CrashBoundary } from './CrashBoundary';
import { describeCrash } from './CrashFallback';
import { i18n, initI18n } from '../../i18n/i18n-setup';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';

let shouldThrow = true;

function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <p>map is back</p>;
}

describe('CrashBoundary', () => {
  beforeAll(async () => {
    await initI18n();
  });

  afterEach(async () => {
    shouldThrow = true;
    vi.restoreAllMocks();
    await i18n.changeLanguage('en');
  });

  it('shows the view fallback instead of an empty tree and logs the error', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    render(
      <div>
        <p>shell survives</p>
        <CrashBoundary scope="view">
          <Bomb />
        </CrashBoundary>
      </div>,
    );

    expect(screen.getByText('shell survives')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(en.crash.viewTitle);
    expect(screen.getByText(/Error: boom/)).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      '[CrashBoundary:view]',
      expect.any(Error),
      expect.any(String),
    );
  });

  it('remounts only its subtree when the view is reloaded', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <CrashBoundary scope="view">
        <Bomb />
      </CrashBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: en.crash.reloadView }));

    expect(screen.getByText('map is back')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reloads the page from the app fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload,
    });

    render(
      <CrashBoundary scope="app">
        <Bomb />
      </CrashBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: en.crash.reloadApp }));

    expect(reload).toHaveBeenCalledOnce();
  });

  it('resolves its copy in Spanish', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await i18n.changeLanguage('es');

    render(
      <CrashBoundary scope="app">
        <Bomb />
      </CrashBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(es.crash.appTitle);
    expect(
      screen.getByRole('button', { name: es.crash.reloadApp }),
    ).toBeInTheDocument();
  });
});

describe('describeCrash', () => {
  it('keeps the error line and drops the message echoed by the stack', () => {
    const error = new TypeError('bad zoom');
    error.stack = 'TypeError: bad zoom\n    at zoomTo (map.js:1:1)\n';

    expect(describeCrash(error)).toBe(
      'TypeError: bad zoom\n    at zoomTo (map.js:1:1)',
    );
  });

  it('stringifies values that are not errors', () => {
    expect(describeCrash('plain string')).toBe('plain string');
  });
});

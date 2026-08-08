import { Moon, Sun } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

type Theme = 'paper' | 'dark';

const themeStorageKey = 'vellum-theme';

export function getInitialTheme(): Theme {
  const queryTheme = new URLSearchParams(window.location.search).get('theme');

  if (queryTheme === 'dark' || queryTheme === 'paper') {
    return queryTheme;
  }

  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return storedTheme === 'dark' ? 'dark' : 'paper';
  } catch {
    return 'paper';
  }
}

interface ThemeSelectorProps {
  onThemeChange: (theme: Theme) => void;
}

/** Small accessible theme control for the landing page footer. */
export function ThemeSelector({ onThemeChange }: ThemeSelectorProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    onThemeChange(theme);

    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // Continue without persistence when storage is unavailable.
    }
  }, [onThemeChange, theme]);

  function chooseTheme(nextTheme: Theme) {
    setTheme(nextTheme);
  }

  return (
    <div className="theme-selector" role="group" aria-label="Color theme">
      <span className="theme-selector-label">Theme</span>
      <div className="theme-selector-options">
        <button
          className="theme-option"
          type="button"
          aria-pressed={theme === 'paper'}
          onClick={() => chooseTheme('paper')}
        >
          <Sun size={15} weight="regular" aria-hidden="true" />
          <span>Light</span>
        </button>
        <button
          className="theme-option"
          type="button"
          aria-pressed={theme === 'dark'}
          onClick={() => chooseTheme('dark')}
        >
          <Moon size={15} weight="regular" aria-hidden="true" />
          <span>Dark</span>
        </button>
      </div>
    </div>
  );
}

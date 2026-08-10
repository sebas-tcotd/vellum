import { Desktop, Moon, Sun } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'auto';

const themeStorageKey = 'vellum-page-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'auto';

  const queryTheme = new URLSearchParams(window.location.search).get('theme');

  if (
    queryTheme === 'light' ||
    queryTheme === 'dark' ||
    queryTheme === 'auto'
  ) {
    return queryTheme;
  }

  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return storedTheme === 'light' ||
      storedTheme === 'dark' ||
      storedTheme === 'auto'
      ? storedTheme
      : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme(theme: Theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
    return;
  }

  document.documentElement.dataset.theme = theme;
}

const themeOptions = [
  { id: 'light', labelKey: 'pageTheme.light', icon: Sun },
  { id: 'dark', labelKey: 'pageTheme.dark', icon: Moon },
  { id: 'auto', labelKey: 'pageTheme.auto', icon: Desktop },
] as const;

/** Compact accessible page theme control for the landing header. */
export function ThemeSelector() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);

    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // Continue without persistence when storage is unavailable.
    }
  }, [theme]);

  return (
    <div
      className="page-theme-selector"
      role="group"
      aria-label={t('pageTheme.label')}
    >
      {themeOptions.map(({ id, labelKey, icon: Icon }) => {
        const label = t(labelKey);

        return (
          <button
            aria-label={label}
            aria-pressed={theme === id}
            className="page-theme-option"
            key={id}
            onClick={() => setTheme(id)}
            title={label}
            type="button"
          >
            <Icon size={14} weight="regular" aria-hidden="true" />
            <span className="page-theme-option-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

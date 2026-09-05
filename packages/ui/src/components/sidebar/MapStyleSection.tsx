import { useTranslation } from 'react-i18next';
import { Switch } from '../../lib/switch';
import { cn } from '../../lib/utils';
import { useVellumStore } from '../../store/vellum-store';
import type { CommandRegistry } from '../../shell/commands';

export interface MapStyleSectionProps {
  commands: CommandRegistry;
}

/**
 * The map's representation choice: one style at a time, plus the dimming
 * option that only means anything while the Transit style is selected.
 */
export function MapStyleSection({ commands }: MapStyleSectionProps) {
  const { t } = useTranslation();
  const availableThemes = useVellumStore((s) => s.availableThemes);
  const activeTheme = useVellumStore((s) => s.activeTheme);
  const transitDimmingEnabled = useVellumStore((s) => s.transitDimmingEnabled);

  if (availableThemes.length === 0) return null;

  return (
    <section
      className="shell-section"
      aria-labelledby="shell-map-style-heading"
    >
      {/* Focusable so Back out of a layer detail opened from the menu or a
          shortcut — which has no on-screen invoker — still lands somewhere
          meaningful instead of dropping focus to the body. */}
      <h2
        className="shell-section__heading"
        id="shell-map-style-heading"
        tabIndex={-1}
      >
        {t('sidebar.mapStyle')}
      </h2>
      <div
        role="group"
        aria-labelledby="shell-map-style-heading"
        className="shell-style-pills"
      >
        {availableThemes.map((theme) => {
          const active = theme.id === activeTheme;
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={active}
              onClick={() => commands['style.set'].execute(theme.id)}
              className={cn('shell-style-pill', active && 'is-selected')}
            >
              {theme.name}
            </button>
          );
        })}
      </div>
      {/* Progressive disclosure by parent relevance: dimming other layers is
          only a meaningful choice while the Transit style is what's drawn. */}
      {activeTheme === 'transit' && (
        <div className="shell-option-row">
          <span className="shell-option-row__label">
            {t('themes.dimNonTransit')}
          </span>
          <Switch
            checked={transitDimmingEnabled}
            onCheckedChange={() => commands['style.transitDimming'].execute()}
            aria-label={t('themes.dimNonTransit')}
          />
        </div>
      )}
    </section>
  );
}

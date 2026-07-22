import type { ThemeWarning } from '@vellum/theme-engine';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export interface ThemeWarningToastProps {
  /** Warnings for `.vellumstyle` files skipped as invalid (AC #5). One line rendered per warning. */
  warnings: ThemeWarning[];
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 6000;

/** Status toast listing `.vellumstyle` files that were skipped as invalid during startup (AC #5, #6).
 * Auto-dismisses after 6s. Mirrors `DlcWarningToast`'s visual language. */
export function ThemeWarningToast({
  warnings,
  onDismiss,
}: ThemeWarningToastProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'flex flex-col gap-1 max-h-[40vh] overflow-y-auto',
        'rounded-xl bg-black/75 px-5 py-3 text-sm text-white shadow-lg backdrop-blur-sm',
      )}
    >
      {warnings.map((warning) => (
        <span key={`${warning.themeId}:${warning.field}`}>
          {warning.field === 'LOAD_FAILED'
            ? t('toasts.themeLoadFailed')
            : warning.field === 'JSON'
              ? t('toasts.invalidThemeJson', { themeName: warning.themeName })
              : t('toasts.invalidTheme', {
                  themeName: warning.themeName,
                  field: warning.field,
                })}
        </span>
      ))}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
        className="self-end shrink-0 opacity-70 hover:opacity-100 transition-opacity text-base leading-none"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

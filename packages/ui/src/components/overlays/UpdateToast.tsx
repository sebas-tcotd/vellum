import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export interface UpdateToastProps {
  /** New release's semantic version, interpolated into the toast text. */
  version: string;
  /** Called when the user clicks "Ver novedades" — opens the release notes URL. */
  onViewChangelog: () => void;
  /** Called when the user dismisses the toast via the ✕ button. */
  onDismiss: () => void;
}

/** Non-intrusive corner toast announcing a new available Vellum version (AC1/AC2).
 * No auto-dismiss — the user closes it explicitly or navigates to the changelog. */
export function UpdateToast({
  version,
  onViewChangelog,
  onDismiss,
}: UpdateToastProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 right-6 z-50',
        'flex items-center gap-3 max-w-sm',
        'rounded-xl bg-black/75 px-5 py-3 text-sm text-white shadow-lg backdrop-blur-sm',
      )}
    >
      <span>{t('updates.available', { version })}</span>
      <button
        type="button"
        onClick={onViewChangelog}
        className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        {t('updates.viewChangelog')}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
        className="self-start shrink-0 opacity-70 hover:opacity-100 transition-opacity text-base leading-none"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

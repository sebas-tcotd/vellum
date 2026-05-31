import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export interface DlcWarningToastProps {
  /** When true, shows "partial data" message instead of DLC warning. Partial data toasts do not auto-dismiss. */
  isPartialData?: boolean;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 6000;

/** Status toast shown after a successful parse with DLC/mod warnings or after a partial-mode parse.
 * DLC warning toasts auto-dismiss after 6s; partial data toasts persist until manually closed (AC3). */
export function DlcWarningToast({
  isPartialData = false,
  onDismiss,
}: DlcWarningToastProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (isPartialData) return; // AC3: partial data toasts require manual dismissal
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [isPartialData, onDismiss]);

  const message = isPartialData
    ? t('toasts.partialDataWarning')
    : t('toasts.partialLoad');

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-3',
        'rounded-xl bg-black/75 px-5 py-3 text-sm text-white shadow-lg backdrop-blur-sm',
      )}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity text-base leading-none"
      >
        ✕
      </button>
    </div>
  );
}

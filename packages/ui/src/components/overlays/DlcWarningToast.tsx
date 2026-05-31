import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export interface DlcWarningToastProps {
  /** When true, shows "partial data" message instead of DLC warning. */
  isPartialData?: boolean;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 6000;

/** Auto-dismissing status toast shown after a successful parse with DLC/mod warnings
 * or after a successful partial-mode parse. */
export function DlcWarningToast({
  isPartialData = false,
  onDismiss,
}: DlcWarningToastProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const message = isPartialData
    ? t('toasts.partialDataWarning')
    : t('toasts.partialLoad');

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'rounded-xl bg-black/75 px-5 py-3 text-sm text-white shadow-lg backdrop-blur-sm',
        'pointer-events-none',
      )}
    >
      {message}
    </div>
  );
}

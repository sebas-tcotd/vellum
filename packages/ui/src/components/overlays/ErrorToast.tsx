import { useTranslation } from 'react-i18next';
import type { VellumError } from '@vellum/core';
import { cn } from '../../lib/utils';

export interface ErrorToastProps {
  error: VellumError;
  onDismiss: () => void;
}

/** Persistent error notification for non-recoverable parse failures.
 * Shown for all VellumError types EXCEPT PartialParse (handled by PartialParseDialog). */
export function ErrorToast({ error, onDismiss }: ErrorToastProps) {
  const { t } = useTranslation();

  const message = (() => {
    switch (error.type) {
      case 'UnsupportedVersion':
        return t('errors.UnsupportedVersion', { found: error.found });
      case 'InvalidFile':
        return t('errors.InvalidFile');
      case 'IoError':
        return t('errors.IoError');
      case 'ExportFailed':
        return t('errors.ExportFailed');
      default:
        return t('errors.InvalidFile');
    }
  })();

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'fixed bottom-6 right-6 z-50',
        'flex items-start gap-3 max-w-sm',
        'rounded-xl bg-black/90 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-sm',
      )}
    >
      <span className="flex-1 leading-relaxed">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
        className="mt-0.5 shrink-0 opacity-70 hover:opacity-100 transition-opacity text-base leading-none"
      >
        ✕
      </button>
    </div>
  );
}

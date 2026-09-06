import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export interface UpdateToastProps {
  /** New release's semantic version, interpolated into the toast text. */
  version: string;
  /** Called when the user clicks "Ver novedades" — opens the release notes URL. */
  onViewChangelog: () => void;
  /**
   * Called when the user clicks "Instalar y reiniciar". Omitted when automatic
   * updates are off, in which case the toast only announces the version.
   * Resolves never (the app restarts) or rejects with the backend's message.
   */
  onInstall?: () => Promise<void>;
  /** Called when the user dismisses the toast via the ✕ button. */
  onDismiss: () => void;
}

/** Non-intrusive corner toast announcing a new available Vellum version (AC1/AC2).
 * No auto-dismiss — the user closes it explicitly or navigates to the changelog.
 *
 * Installing is always an explicit click: the backend detects but never installs,
 * so an update can't restart the app out from under an open map. The in-flight and
 * failed states live here rather than in the store — nothing outside this toast
 * reacts to them. */
export function UpdateToast({
  version,
  onViewChangelog,
  onInstall,
  onDismiss,
}: UpdateToastProps) {
  const { t } = useTranslation();
  const [installState, setInstallState] = useState<
    'idle' | 'installing' | 'failed'
  >('idle');

  const handleInstall = () => {
    if (onInstall === undefined) return;
    setInstallState('installing');
    // A resolved promise still means failure in practice — a successful install
    // never returns, the process is replaced.
    onInstall().catch((error: unknown) => {
      console.warn('UpdateToast: failed to install update', error);
      setInstallState('failed');
    });
  };

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
      <span>
        {installState === 'failed'
          ? t('updates.installFailed')
          : t('updates.available', { version })}
      </span>
      {onInstall !== undefined && installState !== 'failed' && (
        <button
          type="button"
          onClick={handleInstall}
          disabled={installState === 'installing'}
          className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80 transition-opacity disabled:no-underline disabled:opacity-60"
        >
          {installState === 'installing'
            ? t('updates.installing')
            : t('updates.install')}
        </button>
      )}
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

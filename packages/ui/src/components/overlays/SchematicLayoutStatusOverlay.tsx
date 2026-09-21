import { useTranslation } from 'react-i18next';

export function SchematicLayoutStatusOverlay({
  progress,
  failed,
  onCancel,
}: {
  progress: {
    phase: 'deriving' | 'laying-out';
    completed: number;
    total: number;
  } | null;
  failed: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (progress) {
    const percent = Math.round((progress.completed / progress.total) * 100);
    return (
      <div
        role="progressbar"
        aria-busy="true"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={t(`schematicLayoutStatus.${progress.phase}`)}
        className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-3 rounded bg-background px-4 py-2 text-xs shadow"
        data-testid="schematic-layout-status"
      >
        <span>{t(`schematicLayoutStatus.${progress.phase}`)}</span>
        <button type="button" onClick={onCancel} className="underline">
          {t('common.cancel')}
        </button>
      </div>
    );
  }
  return failed ? (
    <div
      role="alert"
      className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded bg-background px-4 py-2 text-xs shadow"
    >
      {t('schematicLayoutStatus.failed')}
    </div>
  ) : null;
}

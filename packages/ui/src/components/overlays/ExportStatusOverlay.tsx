import { useTranslation } from 'react-i18next';
import type { ExportProgress, ExportResult, VellumError } from '@vellum/core';
import { cn } from '../../lib/utils';

export interface ExportStatusOverlayProps {
  isExporting: boolean;
  exportPhase: 'idle' | 'exporting' | 'cancelling';
  exportProgress: ExportProgress | null;
  exportResult: ExportResult | null;
  exportCancelled: boolean;
  exportError: VellumError | null;
  onCancelExport: () => void;
  onOpenExportFolder?: ((folderPath: string) => Promise<void>) | undefined;
}

const TOAST_CLASSNAME =
  'absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-background px-4 py-2 text-xs shadow';

/** Renders the export progress bar plus the terminal result/cancelled/error toasts. */
export function ExportStatusOverlay({
  isExporting,
  exportPhase,
  exportProgress,
  exportResult,
  exportCancelled,
  exportError,
  onCancelExport,
  onOpenExportFolder,
}: ExportStatusOverlayProps) {
  const { t } = useTranslation();

  const exportProgressText =
    exportPhase === 'cancelling'
      ? t('export.cancelling')
      : exportProgress
        ? t(`export.phase.${exportProgress.phase}`)
        : t('export.indeterminate');

  const showPercent =
    exportProgress?.percent !== undefined && exportPhase !== 'cancelling';
  const exportProgressLabel = showPercent
    ? `${exportProgressText} ${t('export.progressPercent', {
        percent: exportProgress?.percent,
      })}`
    : exportProgressText;

  return (
    <>
      {isExporting && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-busy="true"
          {...(showPercent ? { 'aria-valuenow': exportProgress?.percent } : {})}
          aria-valuetext={exportProgressLabel}
          className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded bg-background px-4 py-2 text-xs shadow"
        >
          <span>{exportProgressLabel}</span>
          <button
            type="button"
            onClick={onCancelExport}
            className="pointer-events-auto underline"
          >
            {t('export.cancelButton')}
          </button>
        </div>
      )}
      {exportResult && (
        <div role="status" className={cn(TOAST_CLASSNAME)}>
          {t('export.successToast', {
            fileName: exportResult.filePath.split(/[/\\]/).at(-1),
          })}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void onOpenExportFolder?.(exportResult.folderPath)}
          >
            {t('export.openFolder')}
          </button>
        </div>
      )}
      {exportCancelled && (
        <div role="status" className={cn(TOAST_CLASSNAME)}>
          {t('export.cancelledToast')}
        </div>
      )}
      {exportError && (
        <div role="alert" className={cn(TOAST_CLASSNAME)}>
          {t(
            exportError.type === 'IoError'
              ? 'errors.IoError'
              : 'errors.ExportFailed',
          )}{' '}
          {t('export.outputNotPublished')}
        </div>
      )}
    </>
  );
}

import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import type { ExportProgress, ExportResult, VellumError } from '@vellum/core';
import { cn } from '../../lib/utils';
import {
  EXPORT_CAPACITY_UNAVAILABLE_REASON,
  SVG_UNSUPPORTED_AREA_REASON,
  SVG_UNSUPPORTED_CAMERA_REASON,
} from '../../hooks/use-export-workflow';

export interface ExportStatusOverlayProps {
  isExporting: boolean;
  exportPhase: 'idle' | 'exporting' | 'cancelling';
  exportProgress: ExportProgress | null;
  exportResult: ExportResult | null;
  exportCancelled: boolean;
  exportError: VellumError | null;
  /**
   * i18n keys naming what the export could not render, if anything.
   *
   * @remarks
   * Keys, never prose — the same rule `VellumError.reason` follows. An export
   * that dropped something the user asked for is not a clean success, so these
   * accompany the terminal toast instead of replacing it: the file does exist,
   * it just isn't the one that was configured.
   *
   * @default []
   */
  exportWarnings?: readonly ParseKeys[];
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
  exportWarnings = [],
  onCancelExport,
  onOpenExportFolder,
}: ExportStatusOverlayProps) {
  const { t } = useTranslation();

  // Warnings belong to the outcome, not to the progress: while the export is
  // still running nothing has been dropped yet, and showing them early would
  // leave a notice on screen for the whole operation.
  const showWarnings = exportWarnings.length > 0 && !isExporting;

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
          {t(exportErrorMessageKey(exportError))}{' '}
          {t('export.outputNotPublished')}
        </div>
      )}
      {showWarnings && (
        <div
          role="status"
          className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded bg-background px-4 py-2 text-xs shadow"
        >
          {/* One element per key: joining them would produce a string no
              translation file contains. */}
          {exportWarnings.map((warning) => (
            <p key={warning}>{t(warning)}</p>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Selects the i18n key for a terminal export error.
 *
 * @remarks
 * `reason` is matched by identity, never displayed — the sentinel is a
 * stable internal string, not user-facing copy, so this doesn't violate the
 * "never show `.reason`" rule; it only picks which localized key to render.
 */
function exportErrorMessageKey(
  error: VellumError,
):
  | 'errors.IoError'
  | 'errors.ExportCapacityUnavailable'
  | 'errors.SvgExportUnsupportedCamera'
  | 'errors.SvgExportUnavailable'
  | 'errors.ExportFailed' {
  if (error.type === 'IoError') return 'errors.IoError';
  if (error.type === 'ExportFailed') {
    const key = SENTINEL_MESSAGE_KEYS[error.reason];
    if (key) return key;
  }
  return 'errors.ExportFailed';
}

/** Internal sentinel → localized key. Sentinels are matched, never displayed. */
const SENTINEL_MESSAGE_KEYS: Readonly<
  Record<
    string,
    | 'errors.ExportCapacityUnavailable'
    | 'errors.SvgExportUnsupportedCamera'
    | 'errors.SvgExportUnavailable'
    | undefined
  >
> = {
  [EXPORT_CAPACITY_UNAVAILABLE_REASON]: 'errors.ExportCapacityUnavailable',
  [SVG_UNSUPPORTED_CAMERA_REASON]: 'errors.SvgExportUnsupportedCamera',
  [SVG_UNSUPPORTED_AREA_REASON]: 'errors.SvgExportUnavailable',
};

import { invoke } from '@tauri-apps/api/core';
import type {
  ExportDialogOptions,
  ExportPngOptions,
  ExportResult,
} from '@vellum/core';
import { IPC_COMMANDS } from '@vellum/core';

/** Tauri-only adapter that persists renderer-produced PNG bytes without base64. */
export function useExportPng() {
  const exportPng = async (
    options: ExportDialogOptions,
    pngBytes: Uint8Array,
  ): Promise<ExportResult> => {
    if (!options.format.startsWith('png-')) {
      throw new Error('PNG exporter received a non-PNG format');
    }
    const payload: ExportPngOptions = {
      format: options.format,
      area: options.area,
      background: options.background,
      fileName: options.fileName,
      pngBytes: [...pngBytes],
    };
    return invoke<ExportResult>(IPC_COMMANDS.EXPORT_PNG, { options: payload });
  };

  const openExportFolder = async (folderPath: string): Promise<void> => {
    await invoke(IPC_COMMANDS.OPEN_EXPORT_FOLDER, { folderPath });
  };

  return { exportPng, openExportFolder };
}

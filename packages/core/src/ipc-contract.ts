// packages/core/src/ipc-contract.ts
// LA CONSTITUCIÓN del proyecto — todos los tipos que cruzan el boundary Rust ↔ WebView

// ─── Commands (nombres de funciones Rust en snake_case) ─────────────────────
/** Nombres de los comandos Tauri IPC. Usar siempre estas constantes en lugar de strings literales. */
export const IPC_COMMANDS = {
  PARSE_CSLMAP: 'parse_cslmap',
  EXPORT_PNG: 'export_png',
  EXPORT_SVG: 'export_svg',
} as const;

// ─── Events ────────────────────────────────────────────────────────────────
/** Nombres de los eventos Tauri emitidos desde Rust. Usar siempre estas constantes. */
export const IPC_EVENTS = {
  PROGRESS: 'vellum://progress',
  UPDATE_AVAILABLE: 'vellum://update-available',
} as const;

// ─── VellumError — discriminated union (mirror de errors.rs en Rust) ────────
/**
 * Error tipado que cruza el boundary IPC. Mirror del enum `VellumError` de Rust.
 *
 * La UI mapea cada variant a su clave i18n — nunca mostrar `reason` directamente al usuario.
 * Usar el campo `type` como discriminante en `switch`/guards de tipo.
 */
export type VellumError =
  | { type: 'InvalidFile'; reason: string }
  | { type: 'UnsupportedVersion'; found: string }
  | { type: 'PartialParse'; warnings: string[] }
  | { type: 'ExportFailed'; reason: string }
  | { type: 'IoError'; reason: string };

// ─── Event Payloads ────────────────────────────────────────────────────────
/** Payload del evento `vellum://progress` emitido durante el parseo. */
export interface ProgressPayload {
  currentStep: string; // Rust: current_step
  percent: number; // Rust: percent (f32)
}

/** Payload del evento `vellum://update-available` emitido por el update checker. */
export interface UpdatePayload {
  version: string; // Rust: version
  url: string; // Rust: url (release notes URL)
}

// ─── Export types ──────────────────────────────────────────────────────────
/** Formato de exportación. `png-1x/2x/4x` para PNG a distintas densidades, `svg` vectorial. */
export type ExportFormat = 'png-1x' | 'png-2x' | 'png-4x' | 'svg';

/** Área de exportación: solo el viewport visible o el mapa completo. */
export type ExportArea = 'viewport' | 'full-map';

/** Color de fondo para la exportación. */
export type ExportBackground = 'white' | 'dark' | 'transparent';

/** Opciones completas de exportación pasadas al comando `export_png` o `export_svg`. */
export interface ExportOptions {
  format: ExportFormat;
  area: ExportArea;
  background: ExportBackground;
  fileName: string;
}

/** Resultado de una exportación exitosa con la ruta del archivo generado. */
export interface ExportResult {
  filePath: string; // Rust: file_path — ruta absoluta del archivo exportado
  folderPath: string; // Rust: folder_path — carpeta contenedora para "Abrir carpeta"
}

// ─── Parse result ──────────────────────────────────────────────────────────
import type { CityData } from './types/city-data';

/** Tipo de retorno del comando `parse_cslmap`. Alias de `CityData` para claridad en el contrato. */
export type ParseResult = CityData;

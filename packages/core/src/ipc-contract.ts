// packages/core/src/ipc-contract.ts
// LA CONSTITUCIÓN del proyecto — todos los tipos que cruzan el boundary Rust ↔ WebView

// ─── Commands (nombres de funciones Rust en snake_case) ─────────────────────
export const IPC_COMMANDS = {
  PARSE_CSLMAP: 'parse_cslmap',
  EXPORT_PNG: 'export_png',
  EXPORT_SVG: 'export_svg',
} as const;

// ─── Events ────────────────────────────────────────────────────────────────
export const IPC_EVENTS = {
  PROGRESS: 'vellum://progress',
  UPDATE_AVAILABLE: 'vellum://update-available',
} as const;

// ─── VellumError — discriminated union (mirror de errors.rs en Rust) ────────
export type VellumError =
  | { type: 'InvalidFile'; reason: string }
  | { type: 'UnsupportedVersion'; found: string }
  | { type: 'PartialParse'; warnings: string[] }
  | { type: 'ExportFailed'; reason: string }
  | { type: 'IoError'; reason: string };

// ─── Event Payloads ────────────────────────────────────────────────────────
export interface ProgressPayload {
  currentStep: string; // Rust: current_step
  percent: number; // Rust: percent (f32)
}

export interface UpdatePayload {
  version: string; // Rust: version
  url: string; // Rust: url (release notes URL)
}

// ─── Export types ──────────────────────────────────────────────────────────
export type ExportFormat = 'png-1x' | 'png-2x' | 'png-4x' | 'svg';
export type ExportArea = 'viewport' | 'full-map';
export type ExportBackground = 'white' | 'dark' | 'transparent';

export interface ExportOptions {
  format: ExportFormat;
  area: ExportArea;
  background: ExportBackground;
  fileName: string;
}

export interface ExportResult {
  filePath: string; // Rust: file_path — ruta absoluta del archivo exportado
  folderPath: string; // Rust: folder_path — carpeta contenedora para "Abrir carpeta"
}

// ─── Parse result ──────────────────────────────────────────────────────────
import type { CityData } from './types/city-data';

export type ParseResult = CityData;

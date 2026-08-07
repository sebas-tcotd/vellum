/**
 * Registry of Tauri IPC command names.
 * @remarks
 * **CRITICAL INVARIANT:** These constants map directly to `#[tauri::command]` functions
 * in the Rust backend (`snake_case`). Any modification to these strings requires a
 * synchronized update in the Rust codebase within the same commit. Always use these
 * constants instead of literal strings when invoking commands from the frontend.
 */
export const IPC_COMMANDS = {
  PARSE_CSLMAP: 'parse_cslmap',
  EXPORT_PNG: 'export_png',
  OPEN_EXPORT_FOLDER: 'open_export_folder',
  LOAD_THEMES: 'load_themes',
  /**
   * Opens a transactional export session. Invoked as `{ metadata }`.
   *
   * @remarks
   * Serves both streaming routes; `metadata.mode` selects `tiled-png` or
   * `streaming-svg`. There is deliberately no single-shot `export_svg`
   * command — one would have to build the whole document in memory before
   * returning, which the streaming contract exists to prevent.
   */
  BEGIN_EXPORT: 'begin_export',
  /** Appends one raw binary export frame (see `export-frame.ts`). Invoked with the frame `Uint8Array` directly — no envelope object. */
  APPEND_EXPORT_CHUNK: 'append_export_chunk',
  /** Confirms completeness and atomically publishes the export. Invoked as `{ sessionId }`. */
  FINISH_EXPORT: 'finish_export',
  /** Abandons an export session idempotently. Invoked as `{ sessionId }`. */
  CANCEL_EXPORT: 'cancel_export',
} as const;

/**
 * A single `.vellumstyle` file read from disk by the `load_themes` command.
 * @remarks
 * Exact mirror of the Rust `RawThemeFile` struct (`camelCase` via serde). The Rust
 * side does NOT validate the JSON — `raw_json` is the file's contents verbatim. Field
 * validation (`isColorToken()` etc.) is the exclusive responsibility of `@vellum/theme-engine`.
 */
export interface RawThemeFile {
  /** Stable identifier — the filename without the `.vellumstyle` extension. */
  id: string;
  /** Whether the file came from the bundled resources or the user themes directory. */
  source: 'built-in' | 'user';
  /** The raw, unparsed JSON contents of the file. */
  rawJson: string;
}

/**
 * Registry of Tauri IPC event names emitted from the Rust backend.
 * @remarks
 * Always use these constants when setting up event listeners via `@tauri-apps/api/event`.
 */
export const IPC_EVENTS = {
  PROGRESS: 'vellum://progress',
  UPDATE_AVAILABLE: 'vellum://update-available',
  PARSE_WARNINGS: 'vellum://parse-warnings',
  OPEN_PREFERENCES: 'vellum://open-preferences',
} as const;

/** Payload for the `vellum://parse-warnings` event — emitted when DLC/mod assets are
 * rendered with a generic fallback representation. */
export interface ParseWarningsPayload {
  warnings: string[];
}

/**
 * Discriminated union representing all errors that can cross the IPC boundary.
 * @remarks
 * This type is an exact mirror of the `VellumError` enum in the Rust backend (`errors.rs`).
 * * **CRITICAL RULE:** The `reason` field is strictly for development logging and debugging.
 * The UI layer must NEVER display the raw `reason` string to the user. Instead, use the
 * discriminated `type` field to map the error to a localized `i18n` translation key.
 */
export type VellumError =
  | { type: 'InvalidFile'; reason: string }
  | { type: 'UnsupportedVersion'; found: string }
  | { type: 'PartialParse'; warnings: string[] }
  | { type: 'ExportFailed'; reason: string }
  | { type: 'IoError'; reason: string };

/** Payload structure for the `vellum://progress` event emitted during the parsing phase. */
export interface ProgressPayload {
  /** The current operation being performed (mapped from Rust `current_step`). */
  currentStep: string;
  /** Normalized progress percentage, typically ranging from 0.0 to 100.0 (mapped from Rust `f32`). */
  percent: number;
}

/** Payload structure for the `vellum://update-available` event emitted by the update checker. */
export interface UpdatePayload {
  /** The new version string available for download (mapped from Rust `version`). */
  version: string;
  /** The URL pointing to the release notes or download page (mapped from Rust `url`). */
  url: string;
}

/**
 * Defines the supported output formats for map exportation.
 * @remarks
 * `png-*x` variants determine the pixel density scaling of the rasterized output.
 * `svg` provides a scalable vector graphic format without density multipliers.
 */
export type ExportFormat = 'png-1x' | 'png-2x' | 'png-4x' | 'svg';

/** Defines the spatial boundaries to be included in the exported file. */
export type ExportArea = 'viewport' | 'full-map';

/** Supported long-edge resolutions for full-map PNG exports. */
export type ExportTargetLongEdge = 6000 | 12000 | 16000 | 20000;

/** Defines the background rendering behavior for the exported file. */
export type ExportBackground = 'white' | 'dark' | 'transparent';

/** Configuration options supplied to the `export_png` or `export_svg` IPC commands. */
export interface ExportOptions {
  /** The target export format and resolution multiplier. */
  format: ExportFormat;
  /** The spatial area to capture. */
  area: ExportArea;
  /** Explicit long-edge resolution for full-map exports. */
  targetLongEdge?: ExportTargetLongEdge;
  /** The background color or transparency setting. */
  background: ExportBackground;
  /** The desired filename (without extension) provided by the user. */
  fileName: string;
}

/** PNG-specific IPC payload extending the shared export configuration. */
export interface ExportPngOptions extends ExportOptions {
  /** PNG bytes produced by the isolated MapLibre export surface. */
  pngBytes: number[];
}

/** Result structure returned upon successful completion of an export command. */
export interface ExportResult {
  /** The absolute file system path to the successfully generated asset. */
  filePath: string;
  /** The absolute path to the directory containing the asset, useful for "Open Folder" actions. */
  folderPath: string;
}

import type { CityData } from './types/city-data';

/**
 * The expected return type of the `parse_cslmap` IPC command.
 * @remarks
 * Aliased directly to `CityData` to explicitly denote that the parsing operation
 * yields the complete, immutable root domain model.
 */
export type ParseResult = CityData;

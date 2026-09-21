import type { CityData, SchematicLayout, TransitMode } from '@vellum/core';

/** Versioned, structured-clone-only protocol for schematic layout work. */
export const SCHEMATIC_LAYOUT_PROTOCOL_VERSION = 1;

export type SchematicLayoutKind = 'geographic' | 'octilinear' | 'orthoradial';

export interface SchematicLayoutRequest {
  readonly type: 'layout';
  readonly version: typeof SCHEMATIC_LAYOUT_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly cityData: CityData;
  readonly layout: SchematicLayoutKind;
}

export interface SchematicLayoutCancel {
  readonly type: 'cancel';
  readonly requestId: string;
}

export type SchematicLayoutCommand =
  | SchematicLayoutRequest
  | SchematicLayoutCancel;

export interface SchematicLayoutProgress {
  readonly type: 'progress';
  readonly requestId: string;
  readonly phase: 'deriving' | 'laying-out';
  readonly completed: number;
  readonly total: number;
}

export interface SchematicLayoutComplete {
  readonly type: 'complete';
  readonly requestId: string;
  readonly layout: SchematicLayout;
  readonly lines: readonly {
    readonly lineId: string;
    readonly color: string;
    readonly mode: TransitMode;
    readonly name: string | null;
  }[];
}

export interface SchematicLayoutFailure {
  readonly type: 'error';
  readonly requestId: string;
  /** Phase in which the request failed; never shown to end users verbatim. */
  readonly phase: 'deriving' | 'laying-out';
  /** Stable, safe-to-log classification of the failure. */
  readonly code: string;
  /** Diagnostic only: clients must render localized generic copy. */
  readonly reason: string;
}

export type SchematicLayoutEvent =
  | SchematicLayoutProgress
  | SchematicLayoutComplete
  | SchematicLayoutFailure;

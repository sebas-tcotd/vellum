/**
 * Type definitions for the transit render geometry — the shared vocabulary
 * between {@link buildRenderGeometry} and its `builders/` pipeline stages.
 * See that function's module doc for the rendering steps this geometry feeds.
 */

import type { CsPoint } from '../../coordinate-transform';
import type { TransitMode } from '../../types/city-data';
import type {
  CorridorTransition,
  LineGraphEdge,
  LineGraphNode,
  LineInfo,
  TransitTransferCandidate,
} from '../../types/transit-network';

/** One resolved line slot within a corridor. */
export interface TransitLineSlot {
  /** Transit line occupying this slot. */
  readonly lineId: string;
  /** Signed offset index; physical displacement is `offsetIndex * SLOT_M`. */
  readonly offsetIndex: number;
}

/** A trimmed corridor centerline ready for offset rendering. */
export interface CorridorGeometry {
  /** Line-graph edge id. */
  readonly edgeId: string;
  /** Trimmed centerline, oriented nodeA → nodeB. */
  readonly path: readonly Readonly<CsPoint>[];
  /** Resolved left-to-right slots along the path direction. */
  readonly slots: readonly TransitLineSlot[];
}

/** One inner connection (paper §5 step 3) for a single line at a node. */
export interface ConnectorGeometry {
  /** The line this connector belongs to. */
  readonly lineId: string;
  /** Sampled Bézier path in world space. */
  readonly path: readonly Readonly<CsPoint>[];
}

/** Line metadata attached to a station for hover tooltips. */
export interface StationLineInfo {
  /** Line display name. */
  readonly name: string;
  /** Line color. */
  readonly color: string;
  /** Transit mode. */
  readonly mode: TransitMode;
}

/**
 * A station marker (paper §5 step 4, buffered/rounded variant): a rounded
 * rectangle (capsule) spanning only the corridor slots of the lines that
 * actually stop here — never the whole bundle.
 */
export interface StationGeometry {
  /** Deterministic station id (`stopId:corridorId`). */
  readonly id: string;
  /** Closed rounded-rectangle ring in world space. */
  readonly polygon: readonly Readonly<CsPoint>[];
  /** Lines that stop here (exactly those the marker spans). */
  readonly lines: readonly StationLineInfo[];
  /**
   * Whether this station's source transfer candidate is a `'confirmed'`
   * transfer (two or more distinct lines), per
   * {@link TransitTransferCandidate.confidence}. `false` for a plain,
   * single-line stop — never rendered as a transfer marker.
   */
  readonly confirmedTransfer: boolean;
}

/** Complete render geometry for the transit layer group. */
export interface TransitRenderGeometry {
  /** Trimmed corridors. */
  readonly corridors: readonly CorridorGeometry[];
  /** Inner connections at junction nodes. */
  readonly connectors: readonly ConnectorGeometry[];
  /** Station polygons. */
  readonly stations: readonly StationGeometry[];
}

/** Minimal network view required by the pure render-geometry stage. */
export interface RenderGeometryNetwork {
  readonly lines: ReadonlyMap<string, LineInfo>;
  readonly edges: ReadonlyMap<string, LineGraphEdge>;
  readonly nodes: ReadonlyMap<string, LineGraphNode>;
  readonly transitions: readonly CorridorTransition[];
  readonly lineOrder: ReadonlyMap<string, readonly string[]>;
  readonly transferCandidates: readonly TransitTransferCandidate[];
}

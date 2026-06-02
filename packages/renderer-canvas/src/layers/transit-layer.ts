import type {
  TransitLine,
  TransitStop,
  TransitMode,
  RoadSegment,
  RoadNode,
  CityData,
} from '@vellum/core';

const MAX_STROKE_UNIT = 8;
const MIN_STROKE_UNIT = 2;
const BG_EXTRA = 2;

/** Proximity threshold for merging stops into a single marker, in CS1 world units (meters). */
export const STOP_MERGE_THRESHOLD = 48;

/** Separation in px between marker centers for different modes in a merged group. */
const MULTI_STOP_SPACING = 11;

interface StopEntry {
  stop: TransitStop;
  line: TransitLine;
}

interface StopGroup {
  centroid: { x: number; z: number };
  entries: StopEntry[];
}

function buildSegmentLineUsers(
  transitLines: TransitLine[],
): Map<string, TransitLine[]> {
  const map = new Map<string, TransitLine[]>();
  for (const line of transitLines) {
    for (const pathSeg of line.route) {
      for (const segId of pathSeg.segmentIds) {
        const users = map.get(segId) ?? [];
        if (!users.includes(line)) users.push(line);
        map.set(segId, users);
      }
    }
  }
  return map;
}

function groupStops(lines: TransitLine[]): StopGroup[] {
  const all: StopEntry[] = [];
  for (const line of lines) {
    for (const stop of line.stops) {
      all.push({ stop, line });
    }
  }
  if (all.length === 0) return [];

  const visited = new Set<string>();
  const groups: StopGroup[] = [];

  for (const entry of all) {
    const key = `${entry.stop.id}:${entry.line.id}`;
    if (visited.has(key)) continue;

    const group: StopEntry[] = [entry];
    visited.add(key);

    for (const other of all) {
      const otherKey = `${other.stop.id}:${other.line.id}`;
      if (visited.has(otherKey)) continue;
      const dx = other.stop.position.x - entry.stop.position.x;
      const dz = other.stop.position.z - entry.stop.position.z;
      if (Math.sqrt(dx * dx + dz * dz) <= STOP_MERGE_THRESHOLD) {
        group.push(other);
        visited.add(otherKey);
      }
    }

    const cx = group.reduce((s, e) => s + e.stop.position.x, 0) / group.length;
    const cz = group.reduce((s, e) => s + e.stop.position.z, 0) / group.length;
    groups.push({ centroid: { x: cx, z: cz }, entries: group });
  }
  return groups;
}

/**
 * Returns a lighter or darker variant of a CSS hex color for use as an outline.
 * Dark colors are lightened; light colors are darkened.
 */
function highlightColor(cssColor: string): string {
  const m = cssColor.match(/^#([0-9a-fA-F]{6})$/i);
  if (!m) return cssColor;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const luminance = Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
  const isDark = luminance <= 127;
  const hr = isDark ? Math.round((r + 255) / 2) : Math.round(r / 2);
  const hg = isDark ? Math.round((g + 255) / 2) : Math.round(g / 2);
  const hb = isDark ? Math.round((b + 255) / 2) : Math.round(b / 2);
  return `rgb(${hr},${hg},${hb})`;
}

function drawPolyline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasPoints: [number, number][],
): void {
  if (canvasPoints.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(canvasPoints[0][0], canvasPoints[0][1]);
  for (let i = 1; i < canvasPoints.length; i++) {
    ctx.lineTo(canvasPoints[i][0], canvasPoints[i][1]);
  }
  ctx.stroke();
}

/**
 * Draws a stop marker with a shape specific to the transit mode.
 *
 * Shape mapping:
 *   Bus, Trolleybus, Unknown → circle (radius scales with stop count)
 *   Tram                    → square (8×8)
 *   Train                   → diamond (rotated square)
 *   Metro                   → inverted circle (line color fill, white stroke)
 *   CableCar                → equilateral triangle pointing up
 *   Monorail                → horizontal rectangle (11×5)
 *   Ferry                   → regular pentagon
 *   Blimp                   → horizontal ellipse (12×7)
 *
 * @param ctx - 2D rendering context (canvas or offscreen)
 * @param cx - Marker center X in canvas coordinates
 * @param cy - Marker center Y in canvas coordinates
 * @param mode - Transit mode of the stop
 * @param fillColor - Fill color (typically '#ffffff')
 * @param strokeColor - Stroke color (typically the line's game color)
 * @param count - Number of stops merged into this group (used to scale circle radius)
 *
 * @remarks
 * Metro inverts the color scheme: strokeColor becomes the fill and fillColor becomes
 * the stroke, making filled-circle markers visually distinct from Bus/Trolleybus/Unknown.
 * Circle radius for Bus/Trolleybus/Unknown/Metro scales as `min(6, 3 + floor(count/2))`
 * to provide a count cue for merged same-mode groups.
 */
function drawModeMarker(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  mode: TransitMode,
  fillColor: string,
  strokeColor: string,
  count: number,
): void {
  ctx.lineWidth = 1.5;

  switch (mode) {
    case 'Bus':
    case 'Trolleybus':
    case 'Unknown': {
      const radius = Math.min(6, 3 + Math.floor(count / 2));
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      break;
    }
    case 'Tram': {
      ctx.beginPath();
      ctx.rect(cx - 4, cy - 4, 8, 8);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      break;
    }
    case 'Train': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx + 5, cy);
      ctx.lineTo(cx, cy + 5);
      ctx.lineTo(cx - 5, cy);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      break;
    }
    case 'Metro': {
      const radiusM = Math.min(6, 3 + Math.floor(count / 2));
      ctx.beginPath();
      ctx.arc(cx, cy, radiusM, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.strokeStyle = fillColor;
      ctx.stroke();
      break;
    }
    case 'CableCar': {
      // Equilateral triangle centered on (cx, cy): apex at cy-5, base at cy+2.5, base half-width ±4.33
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx + 4.33, cy + 2.5);
      ctx.lineTo(cx - 4.33, cy + 2.5);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      break;
    }
    case 'Monorail': {
      ctx.beginPath();
      ctx.rect(cx - 5.5, cy - 2.5, 11, 5);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      break;
    }
    case 'Ferry': {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const px = cx + 4.5 * Math.cos(angle);
        const py = cy + 4.5 * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      break;
    }
    case 'Blimp': {
      ctx.beginPath();
      ctx.ellipse(cx, cy, 6, 3.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      break;
    }
  }
}

export function renderTransitLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  transitLines: TransitLine[],
  segmentMap: Map<string, RoadSegment>,
  nodeMap: Map<string, RoadNode>,
  bounds: CityData['bounds'],
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
): void {
  if (transitLines.length === 0) return;

  const rangeX = bounds.maxX - bounds.minX;
  const rangeZ = bounds.maxZ - bounds.minZ;

  if (
    rangeX <= 0 ||
    !Number.isFinite(rangeX) ||
    rangeZ <= 0 ||
    !Number.isFinite(rangeZ)
  )
    return;

  function worldToCanvas(pos: { x: number; z: number }): [number, number] {
    return [
      ((pos.x - bounds.minX) / rangeX) * canvasWidth,
      canvasHeight - ((pos.z - bounds.minZ) / rangeZ) * canvasHeight,
    ];
  }

  const segmentLineUsers = buildSegmentLineUsers(transitLines);
  const scale = canvasWidth / rangeX;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Two-pass rendering mirrors the cslwmv concentric-band approach:
  // bg pass draws all outline strokes first; fg pass draws all route-color strokes on top.
  // Per segment, each route gets a successively narrower stroke (widest = first route drawn).
  for (const pass of ['bg', 'fg'] as const) {
    const segmentVisits = new Map<string, Set<string>>();

    for (const line of transitLines) {
      for (const pathSeg of line.route) {
        for (const segId of pathSeg.segmentIds) {
          const seg = segmentMap.get(segId);
          if (!seg) continue;

          const users = segmentLineUsers.get(segId) ?? [];
          const lineCount = users.length;
          const visits = segmentVisits.get(segId) ?? new Set<string>();
          if (visits.has(line.id)) continue;

          const startNode = nodeMap.get(seg.startNodeId);
          const endNode = nodeMap.get(seg.endNodeId);
          if (!startNode || !endNode) continue;

          const roadWidthPx = seg.width * scale;
          const strokeUnit = Math.max(
            MIN_STROKE_UNIT,
            Math.min(roadWidthPx / lineCount, MAX_STROKE_UNIT),
          );
          const strokeWidth = strokeUnit * (lineCount - visits.size);
          visits.add(line.id);
          segmentVisits.set(segId, visits);

          const worldPoints = [
            startNode.position,
            ...seg.points,
            endNode.position,
          ];
          const canvasPoints = worldPoints.map(worldToCanvas);

          if (pass === 'bg') {
            ctx.lineWidth = strokeWidth + BG_EXTRA;
            ctx.strokeStyle = highlightColor(line.color);
          } else {
            ctx.lineWidth = strokeWidth;
            ctx.strokeStyle = line.color;
          }
          drawPolyline(ctx, canvasPoints);
        }
      }
    }
  }

  const stopGroups = groupStops(transitLines);
  for (const group of stopGroups) {
    const [cx, cy] = worldToCanvas(group.centroid);

    const seenModes = new Set<TransitMode>();
    const uniqueModes: TransitMode[] = [];
    for (const entry of group.entries) {
      if (!seenModes.has(entry.stop.mode)) {
        seenModes.add(entry.stop.mode);
        uniqueModes.push(entry.stop.mode);
      }
    }

    const modeEntriesMap = new Map<TransitMode, StopEntry[]>();
    for (const entry of group.entries) {
      const bucket = modeEntriesMap.get(entry.stop.mode) ?? [];
      bucket.push(entry);
      modeEntriesMap.set(entry.stop.mode, bucket);
    }

    if (uniqueModes.length === 1) {
      drawModeMarker(
        ctx,
        cx,
        cy,
        uniqueModes[0],
        '#ffffff',
        group.entries[0].line.color,
        group.entries.length,
      );
    } else {
      const totalWidth = (uniqueModes.length - 1) * MULTI_STOP_SPACING;
      const startX = cx - totalWidth / 2;
      for (let i = 0; i < uniqueModes.length; i++) {
        const modeEntries = modeEntriesMap.get(uniqueModes[i]) ?? [];
        const lineColor =
          modeEntries[0]?.line.color ?? group.entries[0].line.color;
        drawModeMarker(
          ctx,
          startX + i * MULTI_STOP_SPACING,
          cy,
          uniqueModes[i],
          '#ffffff',
          lineColor,
          modeEntries.length,
        );
      }
    }
  }

  void zoom;
}

import type {
  TransitLine,
  TransitStop,
  TransitMode,
  RoadSegment,
  RoadNode,
  CityData,
} from '@vellum/core';

const LINE_WIDTH = 2;
const LINE_SPACING = 3;
const MAX_LINES_PER_SEGMENT = 8;

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

function drawOffsetPolyline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasPoints: [number, number][],
  offsetAmount: number,
): void {
  if (canvasPoints.length < 2) return;

  ctx.beginPath();

  for (let i = 0; i < canvasPoints.length - 1; i++) {
    const [ax, ay] = canvasPoints[i];
    const [bx, by] = canvasPoints[i + 1];

    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) continue;

    const perpX = -dy / len;
    const perpY = dx / len;

    if (i === 0) {
      ctx.moveTo(ax + perpX * offsetAmount, ay + perpY * offsetAmount);
    }
    ctx.lineTo(bx + perpX * offsetAmount, by + perpY * offsetAmount);
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
      // Invertido: relleno de color, borde blanco — visualmente distinto del Bus
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
      // Triángulo equilátero centrado en (cx, cy): apex=cy-5, base=cy+2.5, base-x=±4.33
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

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const line of transitLines) {
    ctx.strokeStyle = line.color;
    ctx.lineWidth = LINE_WIDTH;

    for (const pathSeg of line.route) {
      for (const segId of pathSeg.segmentIds) {
        const seg = segmentMap.get(segId);
        if (!seg) continue;
        const startNode = nodeMap.get(seg.startNodeId);
        const endNode = nodeMap.get(seg.endNodeId);
        if (!startNode || !endNode) continue;

        const worldPoints = [
          startNode.position,
          ...seg.points,
          endNode.position,
        ];
        const canvasPoints = worldPoints.map(worldToCanvas);

        const users = segmentLineUsers.get(segId) ?? [];
        const lineCount = Math.min(users.length, MAX_LINES_PER_SEGMENT);
        const lineIndex = Math.min(
          users.indexOf(line),
          MAX_LINES_PER_SEGMENT - 1,
        );
        const offsetAmount = (lineIndex - (lineCount - 1) / 2) * LINE_SPACING;

        drawOffsetPolyline(ctx, canvasPoints, offsetAmount);
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
        const modeEntries = group.entries.filter(
          (e) => e.stop.mode === uniqueModes[i],
        );
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

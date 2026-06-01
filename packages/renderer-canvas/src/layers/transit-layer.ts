import type {
  TransitLine,
  TransitStop,
  RoadSegment,
  RoadNode,
  CityData,
} from '@vellum/core';

const LINE_WIDTH = 2;
const LINE_SPACING = 3;
const MAX_LINES_PER_SEGMENT = 8;

/** Proximity threshold for merging stops into a single marker, in CS1 world units (meters). */
export const STOP_MERGE_THRESHOLD = 48;

interface StopEntry {
  stop: TransitStop;
  line: TransitLine;
  indexInLine: number;
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
    for (let i = 0; i < line.stops.length; i++) {
      all.push({ stop: line.stops[i], line, indexInLine: i });
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

function drawGroupedStop(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  count: number,
  lineColor: string,
): void {
  const r = Math.min(6, 3 + Math.floor(count / 2));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawSingleStop(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: { x: number; y: number },
  lineColor: string,
): void {
  const SIZE = 5;
  const LENGTH = 9;

  const tipX = cx + dir.x * LENGTH;
  const tipY = cy + dir.y * LENGTH;
  const blX = cx + dir.y * SIZE;
  const blY = cy - dir.x * SIZE;
  const brX = cx - dir.y * SIZE;
  const brY = cy + dir.x * SIZE;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(blX, blY);
  ctx.lineTo(brX, brY);
  ctx.closePath();
  ctx.fillStyle = lineColor;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
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

    if (group.entries.length >= 2) {
      drawGroupedStop(
        ctx,
        cx,
        cy,
        group.entries.length,
        group.entries[0].line.color,
      );
    } else {
      const { line, indexInLine } = group.entries[0];
      if (line.stops.length < 2) continue;
      const nextIdx = (indexInLine + 1) % line.stops.length;
      const [nx, ny] = worldToCanvas(line.stops[nextIdx].position);
      const dx = nx - cx;
      const dy = ny - cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const dir = len > 0.001 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
      drawSingleStop(ctx, cx, cy, dir, line.color);
    }
  }

  void zoom;
}

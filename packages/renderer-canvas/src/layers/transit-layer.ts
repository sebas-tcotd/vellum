import type {
  TransitLine,
  RoadSegment,
  RoadNode,
  CityData,
} from '@vellum/core';

const LINE_WIDTH = 2;
const LINE_SPACING = 3;
const MAX_LINES_PER_SEGMENT = 8;

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

  function worldToCanvas(pos: { x: number; z: number }): [number, number] {
    return [
      ((pos.x - bounds.minX) / rangeX) * canvasWidth,
      canvasHeight - ((pos.z - bounds.minZ) / rangeZ) * canvasHeight,
    ];
  }

  const segmentLineUsers = buildSegmentLineUsers(transitLines);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = LINE_WIDTH;

  for (const line of transitLines) {
    ctx.strokeStyle = line.color;

    for (const pathSeg of line.route) {
      for (const segId of pathSeg.segmentIds) {
        const seg = segmentMap.get(segId);
        if (!seg) continue;
        const startNode = nodeMap.get(seg.startNodeId);
        const endNode = nodeMap.get(seg.endNodeId);
        if (!startNode || !endNode) continue;

        const [x0, y0] = worldToCanvas(startNode.position);
        const [x1, y1] = worldToCanvas(endNode.position);

        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) continue;

        const perpX = -dy / len;
        const perpY = dx / len;

        const users = segmentLineUsers.get(segId) ?? [];
        const lineCount = Math.min(users.length, MAX_LINES_PER_SEGMENT);
        const lineIndex = Math.min(
          users.indexOf(line),
          MAX_LINES_PER_SEGMENT - 1,
        );
        const offsetAmount = (lineIndex - (lineCount - 1) / 2) * LINE_SPACING;

        ctx.beginPath();
        ctx.moveTo(x0 + perpX * offsetAmount, y0 + perpY * offsetAmount);
        ctx.lineTo(x1 + perpX * offsetAmount, y1 + perpY * offsetAmount);
        ctx.stroke();
      }
    }
  }

  void zoom; // recibido para consistencia con otras capas; no aplicado en v1
}

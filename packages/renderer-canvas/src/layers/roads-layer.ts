import type { RoadSegment, RoadNode, CityData, WayType } from '@vellum/core';
import type { RendererTokens } from '../tokens';

interface RoadStyle {
  fixed: number;
  scaled: number;
  fill: keyof RendererTokens;
  casing: keyof RendererTokens;
}

const ROAD_STYLES = {
  highway: { fixed: 4, scaled: 2, fill: 'roadHighway', casing: 'roadCasing' },
  arterial: { fixed: 3, scaled: 1, fill: 'roadArterial', casing: 'roadCasing' },
  local: { fixed: 2, scaled: 0.5, fill: 'roadLocal', casing: 'roadCasing' },
  pedestrian: {
    fixed: 1,
    scaled: 0.3,
    fill: 'roadPedestrian',
    casing: 'roadCasing',
  },
} satisfies Record<string, RoadStyle>;

function classifyWayType(wayType: WayType[]): keyof typeof ROAD_STYLES {
  if (wayType.includes('Highway')) return 'highway';
  if (wayType.includes('Elevated')) return 'highway';
  if (wayType.includes('Pedestrian') || wayType.includes('Bicycle'))
    return 'pedestrian';
  if (wayType.includes('Road')) return 'local';
  return 'local';
}

export function renderRoadsLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  segments: RoadSegment[],
  nodeMap: Map<string, RoadNode>,
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
): void {
  if (segments.length === 0) return;

  const rangeX = bounds.maxX - bounds.minX;
  const rangeZ = bounds.maxZ - bounds.minZ;

  function worldToCanvas(pos: { x: number; z: number }): [number, number] {
    return [
      ((pos.x - bounds.minX) / rangeX) * canvasWidth,
      canvasHeight - ((pos.z - bounds.minZ) / rangeZ) * canvasHeight,
    ];
  }

  if (rangeX === 0 || rangeZ === 0) return;

  const tiers = ['local', 'pedestrian', 'arterial', 'highway'] as const;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const pass of ['casing', 'fill'] as const) {
    for (const tier of tiers) {
      for (const seg of segments) {
        if (classifyWayType(seg.wayType) !== tier) continue;
        const startNode = nodeMap.get(seg.startNodeId);
        const endNode = nodeMap.get(seg.endNodeId);
        if (!startNode || !endNode) continue;

        const style = ROAD_STYLES[tier];
        const [x0, y0] = worldToCanvas(startNode.position);
        const [x1, y1] = worldToCanvas(endNode.position);
        const baseWidth = style.fixed + style.scaled * zoom;

        if (pass === 'casing') {
          ctx.strokeStyle = tokens[style.casing];
          ctx.lineWidth = baseWidth + 1.5;
        } else {
          ctx.strokeStyle = tokens[style.fill];
          ctx.lineWidth = baseWidth;
        }

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
  }
}

import type { RoadSegment, RoadNode, CityData, WayType } from '@vellum/core';
import type { RendererTokens } from '../tokens';

type RoadTier =
  | 'highway'
  | 'railway'
  | 'largeArterial'
  | 'mediumArterial'
  | 'local'
  | 'gravel'
  | 'pedestrian'
  | 'pedestrianWay';

interface RoadStyle {
  fixed: number;
  scaled: number;
  fill: keyof RendererTokens;
  casing: keyof RendererTokens | null;
  casingExtra: number;
  dash?: [number, number];
}

// Tiers con color distintivo no necesitan casing para visibilidad.
// Tiers neutros (local, gravel, pedestrian) sí — sin casing se funden con el terreno.
const ROAD_STYLES = {
  highway: {
    fixed: 2.5,
    scaled: 2,
    fill: 'roadHighway',
    casing: 'roadHighwayCasing',
    casingExtra: 2,
  },
  railway: {
    // Fill = rieles (línea delgada sólida). Casing = traviesas (línea ancha dashed butt).
    fixed: 1.2,
    scaled: 0.2,
    fill: 'roadRailway',
    casing: 'roadRailwayCasing',
    casingExtra: 5,
  },
  largeArterial: {
    fixed: 4,
    scaled: 1,
    fill: 'roadLargeArterial',
    casing: 'roadLargeArterialCasing',
    casingExtra: 1.5,
  },
  mediumArterial: {
    fixed: 4,
    scaled: 0.8,
    fill: 'roadMediumArterial',
    casing: 'roadMediumArterialCasing',
    casingExtra: 1.5,
  },
  local: {
    fixed: 2,
    scaled: 0.5,
    fill: 'roadLocal',
    casing: 'roadLocalCasing',
    casingExtra: 1.5,
  },
  gravel: {
    fixed: 1.5,
    scaled: 0.4,
    fill: 'roadGravel',
    casing: 'roadGravelCasing',
    casingExtra: 1.5,
    dash: [4, 2] as [number, number],
  },
  pedestrian: {
    fixed: 1.5,
    scaled: 0.3,
    fill: 'roadPedestrian',
    casing: 'roadPedestrianCasing',
    casingExtra: 1.2,
  },
  pedestrianWay: {
    fixed: 1,
    scaled: 0.2,
    fill: 'roadPedestrianWay',
    casing: null,
    casingExtra: 0,
    dash: [2, 1.5] as [number, number],
  },
} satisfies Record<RoadTier, RoadStyle>;

// itemClass es la fuente de verdad para la jerarquía semántica de CS1.
// Variantes Tunnel preservan el tier base — wayType lleva el flag Tunnel para el treatment visual.
const ITEM_CLASS_TIER: Readonly<Record<string, RoadTier>> = {
  Highway: 'highway',
  'Large Road': 'largeArterial',
  'Medium Road': 'mediumArterial',
  'Small Road': 'local',
  'Gravel Road': 'gravel',
  'Pedestrian Way': 'pedestrianWay',
  'Pedestrian Path': 'pedestrianWay',
  'Train Track': 'railway',
  'Highway Tunnel': 'highway',
  'Large Road Tunnel': 'largeArterial',
  'Medium Road Tunnel': 'mediumArterial',
  'Small Road Tunnel': 'local',
  'Pedestrian Tunnel': 'pedestrianWay',
  'Pedestrian Bridge': 'pedestrian',
};

// Infraestructura no-vial que llega al array roadSegments — no renderizar en la capa de roads.
// La exclusión correcta es en el parser; esto es defensa en profundidad en el renderer.
const ROAD_EXCLUDED_ITEM_CLASSES = new Set([
  'Electricity Wire',
  'Airplane Path',
  'Ship Path',
  'Tram Line',
  'Tram Facility',
]);

function classifyRoadSegment(
  itemClass: string,
  wayType: WayType[],
  width: number,
): RoadTier | null {
  if (ROAD_EXCLUDED_ITEM_CLASSES.has(itemClass)) return null;

  const tier = ITEM_CLASS_TIER[itemClass];
  if (tier !== undefined) return tier;

  // DLC/mods: fallback a wayType flags
  if (wayType.includes('Highway')) return 'highway';
  if (wayType.includes('Pedestrian')) return 'pedestrianWay';

  // Último recurso: width heurístico (mismo umbral que dlc_fallback.rs)
  if (width >= 28) return 'largeArterial';
  if (width >= 14) return 'local';
  return 'pedestrianWay';
}

// Aclara un color hex en un porcentaje dado (0–100)
function lightenHex(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16);
  const delta = Math.round((255 * percent) / 100);
  const r = Math.min(255, (n >> 16) + delta);
  const g = Math.min(255, ((n >> 8) & 0xff) + delta);
  const b = Math.min(255, (n & 0xff) + delta);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Orden de renderizado: de menos a más prominente
const TIER_ORDER: RoadTier[] = [
  'pedestrianWay',
  'pedestrian',
  'gravel',
  'local',
  'mediumArterial',
  'largeArterial',
  'railway',
  'highway',
];

export function renderRoadsLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  segments: RoadSegment[],
  nodeMap: Map<string, RoadNode>,
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  panX = 0,
  panY = 0,
): void {
  if (segments.length === 0) return;

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
    const cx = ((pos.x - bounds.minX) / rangeX) * canvasWidth;
    const cy = canvasHeight - ((pos.z - bounds.minZ) / rangeZ) * canvasHeight;
    return [cx * zoom + panX, cy * zoom + panY];
  }

  ctx.lineJoin = 'round';

  for (const pass of ['casing', 'fill'] as const) {
    for (const tier of TIER_ORDER) {
      const style = ROAD_STYLES[tier];

      if (pass === 'casing' && style.casing === null) continue;

      for (const seg of segments) {
        const segTier = classifyRoadSegment(
          seg.itemClass,
          seg.wayType,
          seg.width,
        );
        if (segTier === null || segTier !== tier) continue;

        const startNode = nodeMap.get(seg.startNodeId);
        const endNode = nodeMap.get(seg.endNodeId);
        if (!startNode || !endNode) continue;

        const isTunnel = seg.wayType.includes('Tunnel');
        const isBridge = seg.wayType.includes('Bridge');
        const isConnector = tier === 'highway' && seg.width <= 14;
        const scaleFactor = isConnector ? 0.65 : 1.0;
        const baseWidth = (style.fixed + style.scaled * zoom) * scaleFactor;

        const worldPoints = [
          startNode.position,
          ...seg.points,
          endNode.position,
        ];
        const canvasPoints = worldPoints.map(worldToCanvas);

        if (pass === 'casing') {
          ctx.strokeStyle = tokens[style.casing as keyof RendererTokens];
          ctx.lineWidth = baseWidth + style.casingExtra;
          if (tier === 'railway') {
            // Traviesas: casing ancho con extremos cuadrados y espaciado periódico
            ctx.lineCap = 'butt';
            ctx.setLineDash([10, 8]);
          } else if (isTunnel || isBridge) {
            ctx.lineCap = 'round';
            ctx.setLineDash([6, 3]);
          } else {
            ctx.lineCap = 'round';
            ctx.setLineDash([]);
          }
        } else {
          // Fill pass: rieles de railway = línea sólida delgada sin dash
          const fillColor =
            isTunnel || isBridge
              ? lightenHex(tokens[style.fill], 10)
              : tokens[style.fill];
          ctx.strokeStyle = fillColor;
          ctx.lineWidth = baseWidth;
          ctx.lineCap = 'round';
          if (isTunnel || isBridge) {
            ctx.setLineDash([6, 3]);
          } else if (tier === 'railway') {
            ctx.setLineDash([]);
          } else if ('dash' in style && style.dash) {
            ctx.setLineDash(style.dash);
          } else {
            ctx.setLineDash([]);
          }
        }

        ctx.beginPath();
        ctx.moveTo(canvasPoints[0][0], canvasPoints[0][1]);
        for (let i = 1; i < canvasPoints.length; i++) {
          ctx.lineTo(canvasPoints[i][0], canvasPoints[i][1]);
        }
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.lineCap = 'round';
      }
    }
  }
}

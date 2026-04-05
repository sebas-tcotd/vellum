// packages/core/src/types/city-data.ts
// Modelo de dominio central — producido por el parser, consumido por el renderer

// ─── Coordenadas y geometría ────────────────────────────────────────────────
/** Punto en espacio 3D del juego. Eje X = este-oeste, Y = elevación, Z = norte-sur. */
export interface Vec3 {
  x: number; // este-oeste
  y: number; // elevación
  z: number; // norte-sur (mapea al eje Y del canvas)
}

// ─── Terrain ────────────────────────────────────────────────────────────────
// INVARIANTE: LandArray y WaterArray son SIEMPRE arrays separados — nunca un heightmap unificado
/** Celda de terreno seco con su nivel de elevación discreta (0–23). */
export interface LandTile {
  elevation: number; // nivel de elevación (0-23 niveles en los 24 umbrales)
  x: number;
  z: number;
}

/** Celda de agua con su profundidad en unidades del juego. */
export interface WaterTile {
  depth: number;
  x: number;
  z: number;
}

// ─── Vías ───────────────────────────────────────────────────────────────────
// WayType es una máscara de bits (flags combinables)
/** Clasificación de un segmento vial. Se pueden combinar múltiples flags en un array. */
export type WayType =
  | 'Road'
  | 'Highway'
  | 'Elevated'
  | 'Underground'
  | 'Bridge'
  | 'Tunnel'
  | 'Pedestrian'
  | 'Bicycle'
  | 'None';

/** Nodo de intersección o extremo de un segmento vial. */
export interface RoadNode {
  id: string;
  position: Vec3;
}

/**
 * Segmento vial entre dos nodos.
 * Siempre excluye segmentos `icls="Bus Line"` — son conectores virtuales filtrados por el parser.
 */
export interface RoadSegment {
  id: string;
  startNodeId: string;
  endNodeId: string;
  wayType: WayType[]; // flags combinados
  itemClass: string; // clase original del asset
  width: number; // ancho en unidades del juego
  // Nota: segmentos con icls="Bus Line" son EXCLUIDOS de este array por el parser
}

// ─── Tránsito ───────────────────────────────────────────────────────────────
/** Modo de transporte de una línea o parada. `Unknown` para tipos no reconocidos en el .cslmap. */
export type TransitMode =
  | 'Bus'
  | 'Tram'
  | 'Train'
  | 'Metro'
  | 'CableCar'
  | 'Monorail'
  | 'Ferry'
  | 'Blimp'
  | 'Trolleybus'
  | 'Unknown';

/** Parada de tránsito con posición geográfica y modo de transporte. */
export interface TransitStop {
  id: string;
  mode: TransitMode;
  position: Vec3;
  name: string;
}

/**
 * Segmento de ruta pre-calculada: lista ordenada de IDs de `RoadSegment`.
 * No se necesita pathfinding — el juego ya calculó y serializó las rutas en el .cslmap.
 */
export interface PathSegment {
  segmentIds: string[]; // IDs de RoadSegment en orden de recorrido
}

/** Línea de transporte público con su ruta completa pre-calculada y sus paradas. */
export interface TransitLine {
  id: string;
  name: string;
  mode: TransitMode;
  color: string; // color hex del juego, ej: '#FF6600'
  stops: TransitStop[];
  route: PathSegment[]; // ruta completa pre-calculada
}

// ─── Edificios ──────────────────────────────────────────────────────────────
/**
 * Edificio con su huella poligonal en coordenadas del juego.
 * `itemClass` se usa para filtrar tipos excluidos (p.ej. `'Beautification Item'`).
 */
export interface Building {
  id: string;
  position: Vec3;
  itemClass: string; // usado para filtrado: excluir 'Beautification Item', etc.
  footprint: Vec3[]; // polígono del edificio
}

// ─── Bosques ────────────────────────────────────────────────────────────────
/** Celda de vegetación con densidad normalizada (0.0–1.0). */
export interface ForestCell {
  x: number;
  z: number;
  density: number; // 0.0–1.0
}

// ─── Distritos ──────────────────────────────────────────────────────────────
/** Distrito de la ciudad con su polígono de delimitación. */
export interface District {
  id: string;
  name: string;
  boundary: Vec3[]; // polígono del distrito
}

// ─── CityData — modelo central ──────────────────────────────────────────────
/**
 * Modelo de dominio raíz que representa una ciudad completa parseada desde un `.cslmap`.
 *
 * Inmutable una vez construido: el parser lo produce, el renderer lo consume sin mutarlo.
 * Todos los arrays pueden estar vacíos pero nunca son `null`.
 */
export interface CityData {
  cityName: string;
  fileName: string;
  generatedAt: string; // ISO timestamp

  // Bounds del mapa (derivados del XML)
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    seaLevel: number; // typical: 40 — todo y < seaLevel es agua/subterráneo
  };

  // Capas de datos (arrays — nunca null, pueden ser vacíos)
  landTiles: LandTile[];
  waterTiles: WaterTile[];
  roadNodes: RoadNode[];
  roadSegments: RoadSegment[]; // Bus Line ya excluidos
  transitLines: TransitLine[];
  buildings: Building[];
  forestCells: ForestCell[];
  districts: District[];
}

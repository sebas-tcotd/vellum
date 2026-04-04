// packages/core/src/types/city-data.ts
// Modelo de dominio central — producido por el parser, consumido por el renderer

// ─── Coordenadas y geometría ────────────────────────────────────────────────
export interface Vec3 {
  x: number; // este-oeste
  y: number; // elevación
  z: number; // norte-sur (mapea al eje Y del canvas)
}

// ─── Terrain ────────────────────────────────────────────────────────────────
// INVARIANTE: LandArray y WaterArray son SIEMPRE arrays separados — nunca un heightmap unificado
export interface LandTile {
  elevation: number; // nivel de elevación (0-23 niveles en los 24 umbrales)
  x: number;
  z: number;
}

export interface WaterTile {
  depth: number;
  x: number;
  z: number;
}

// ─── Vías ───────────────────────────────────────────────────────────────────
// WayType es una máscara de bits (flags combinables)
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

export interface RoadNode {
  id: string;
  position: Vec3;
}

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

export interface TransitStop {
  id: string;
  mode: TransitMode;
  position: Vec3;
  name: string;
}

// Rutas PRE-CALCULADAS: PathSegment es la lista de RoadSegment IDs en orden de recorrido
// NO se necesita pathfinding — el juego ya calculó las rutas y las serializó en el .cslmap
export interface PathSegment {
  segmentIds: string[]; // IDs de RoadSegment en orden de recorrido
}

export interface TransitLine {
  id: string;
  name: string;
  mode: TransitMode;
  color: string; // color hex del juego, ej: '#FF6600'
  stops: TransitStop[];
  route: PathSegment[]; // ruta completa pre-calculada
}

// ─── Edificios ──────────────────────────────────────────────────────────────
export interface Building {
  id: string;
  position: Vec3;
  itemClass: string; // usado para filtrado: excluir 'Beautification Item', etc.
  footprint: Vec3[]; // polígono del edificio
}

// ─── Bosques ────────────────────────────────────────────────────────────────
export interface ForestCell {
  x: number;
  z: number;
  density: number; // 0.0–1.0
}

// ─── Distritos ──────────────────────────────────────────────────────────────
export interface District {
  id: string;
  name: string;
  boundary: Vec3[]; // polígono del distrito
}

// ─── CityData — modelo central ──────────────────────────────────────────────
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

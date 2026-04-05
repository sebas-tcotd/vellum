// packages/core/src/constants.ts

/** Límite soft de tamaño de archivo para mostrar aviso al usuario. No hay límite duro de carga. */
export const MAX_FILE_SIZE_MB = 50;

/** Nombre del tema visual activo por defecto al abrir la aplicación. */
export const DEFAULT_THEME = 'day';

/** Nivel de mar por defecto en unidades del juego. Todo `y < SEA_LEVEL_DEFAULT` es agua. */
export const SEA_LEVEL_DEFAULT = 40; // valor típico en .cslmap de CS1

/** Mitad del tamaño total del mapa en unidades del juego. El mapa cubre ±8640 en X y Z. */
export const GAME_MAP_HALF_EXTENT = 8640; // unidades de juego: mapa = ±8640 en X y Z

/** Radio máximo en unidades del juego para fusionar paradas de tránsito en el tooltip. */
export const STOP_MERGE_RADIUS_UNITS = 48; // paradas a ≤48 unidades se fusionan en tooltip

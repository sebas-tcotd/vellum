/**
 * Fixed-color service icons for civic buildings, mirroring Cities: Skylines'
 * own service HUD categories (Electricity, Water, Garbage, Health, Fire,
 * Security, Education, Parks, Monuments) so the icons read as familiar to
 * CS1 players regardless of the active Vellum theme.
 *
 * @remarks
 * Icon paths are copied from `@mapbox/maki` (CC0 license, no attribution
 * required) rather than imported from the package at runtime — same
 * approach as the grid pattern SVG in `layers/layer-background.ts`. Colors
 * are fixed constants, not sourced from `RenderStyleParams`: same rationale
 * as the RICO zoning colors (`expressions/building-color.ts`) and the
 * station markers (`layers/layer-transit.ts`) — a recognizable convention
 * should look the same across every theme, not blend into it.
 */

/** A civic building's service-icon category, mirroring CS1's own HUD tabs. */
export type ServiceGroup =
  | 'electricity'
  | 'water'
  | 'waste'
  | 'health'
  | 'fire'
  | 'security'
  | 'education'
  | 'parks'
  | 'monuments';

/** 15x15 Maki icon path data (viewBox "0 0 15 15"), keyed by Maki icon id. */
const MAKI_PATHS = {
  industry:
    'M14,1v12H1V8.72c0.0016-0.1419,0.0634-0.2764,0.17-0.37l3-3.22c0.2074-0.1823,0.5234-0.1618,0.7056,0.0456C4.9568,5.268,5.0011,5.387,5,5.51v3l3.16-3.37c0.2025-0.1878,0.5188-0.1759,0.7066,0.0266C8.9532,5.2599,9.0009,5.3827,9,5.51V11h3V1H14z',
  water:
    'M7.5 14C9.57688 14 12 12.7117 12 9.43241C12 7.20724 8.53844 2.2883 7.5 1C6.57691 2.2883 3 7.09007 3 9.43241C3 12.7117 5.42312 14 7.5 14Z',
  'waste-basket':
    'M12.41,5.58l-1.34,8c-0.0433,0.2368-0.2493,0.4091-0.49,0.41H4.42c-0.2407-0.0009-0.4467-0.1732-0.49-0.41l-1.34-8C2.5458,5.3074,2.731,5.0506,3.0035,5.0064C3.0288,5.0023,3.0544,5.0002,3.08,5h8.83c0.2761-0.0036,0.5028,0.2174,0.5064,0.4935C12.4168,5.5225,12.4146,5.5514,12.41,5.58z M13,3.5C13,3.7761,12.7761,4,12.5,4h-10C2.2239,4,2,3.7761,2,3.5S2.2239,3,2.5,3H5V1.5C5,1.2239,5.2239,1,5.5,1h4C9.7761,1,10,1.2239,10,1.5V3h2.5C12.7761,3,13,3.2239,13,3.5z M9,3V2H6v1H9z',
  hospital:
    'M7,1C6.4,1,6,1.4,6,2v4H2C1.4,6,1,6.4,1,7v1c0,0.6,0.4,1,1,1h4v4c0,0.6,0.4,1,1,1h1c0.6,0,1-0.4,1-1V9h4c0.6,0,1-0.4,1-1V7c0-0.6-0.4-1-1-1H9V2c0-0.6-0.4-1-1-1H7z',
  'fire-station':
    'M7.5 14C11.0899 14 14 11 14 7.50003C14 4.5 11.5 2 11.5 2L10.5 5.5L7.5 1L4.5 5.5L3.5 2C3.5 2 1 4.5 1 7.50003C1 11 3.91015 14 7.5 14ZM7.5 12.5C6.11929 12.5 5 11.3807 5 10C5 8.61929 7.5 5.5 7.5 5.5C7.5 5.5 10 8.61929 10 10C10 11.3807 8.88071 12.5 7.5 12.5Z',
  police:
    'M5.5,1L6,2h5l0.5-1H5.5z M6,2.5v1.25c0,0,0,2.75,2.5,2.75S11,3.75,11,3.75V2.5H6z M1.9844,3.9863C1.4329,3.9949,0.9924,4.4485,1,5v4c-0.0001,0.6398,0.5922,1.1152,1.2168,0.9766L5,9.3574V14l5.8789-6.9297C10.7391,7.0294,10.5947,7,10.4414,7H6.5L3,7.7539V5C3.0077,4.4362,2.5481,3.9775,1.9844,3.9863z M11.748,7.7109L6.4121,14H12V8.5586C12,8.2451,11.9061,7.9548,11.748,7.7109z',
  school:
    'M5.542 3.647 3.106 3l.443-1.63a.505.505 0 0 1 .618-.352l1.46.392a.5.5 0 0 1 .355.613l-.44 1.624Zm-4.52 7.356a.496.496 0 0 1-.005-.276l1.819-6.726 2.435.647-1.819 6.726a.499.499 0 0 1-.143.237l-1.457 1.347a.152.152 0 0 1-.247-.066l-.583-1.889ZM10 5c-2.25 0-3-.75-3-3 2.25 0 3 .75 3 3Zm-1.4 7.984c-1.37.21-3.126-1.706-3.52-3.8L5.969 5.9c.399-.35.903-.533 1.419-.533a2.71 2.71 0 0 1 1.564.489.964.964 0 0 0 1.089-.01 2.438 2.438 0 0 1 1.46-.479c.77 0 1.643.489 2.05 1.201 1.536 2.696-1.194 6.709-3.144 6.417a.867.867 0 0 1-.255-.093 1.427 1.427 0 0 0-1.302 0 .866.866 0 0 1-.25.092Z',
  park: 'M14,5.75c0.0113-0.6863-0.3798-1.3159-1-1.61C12.9475,3.4906,12.4014,2.9926,11.75,3c-0.0988,0.0079-0.1962,0.0281-0.29,0.06c-0.0607-0.66-0.6449-1.1458-1.3048-1.0851C9.8965,1.9987,9.6526,2.1058,9.46,2.28l0,0c0-0.6904-0.5596-1.25-1.25-1.25S6.96,1.5896,6.96,2.28C6.96,2.28,7,2.3,7,2.33C6.4886,1.8913,5.7184,1.9503,5.2797,2.4618C5.1316,2.6345,5.0347,2.8451,5,3.07C4.8417,3.0195,4.6761,2.9959,4.51,3C3.6816,2.9931,3.0044,3.659,2.9975,4.4874C2.9958,4.6872,3.0341,4.8852,3.11,5.07C2.3175,5.2915,1.8546,6.1136,2.0761,6.9061C2.2163,7.4078,2.6083,7.7998,3.11,7.94c0.2533,0.7829,1.0934,1.2123,1.8763,0.959C5.5216,8.7258,5.9137,8.2659,6,7.71C6.183,7.8691,6.4093,7.9701,6.65,8v5L5,14h5l-1.6-1v-2c0.7381-0.8915,1.6915-1.5799,2.77-2c0.8012,0.1879,1.603-0.3092,1.7909-1.1103C12.9893,7.7686,13.0025,7.6444,13,7.52c0.0029-0.0533,0.0029-0.1067,0-0.16C13.6202,7.0659,14.0113,6.4363,14,5.75z M8.4,10.26V6.82C8.6703,7.3007,9.1785,7.5987,9.73,7.6h0.28c0.0156,0.4391,0.2242,0.849,0.57,1.12C9.7643,9.094,9.0251,9.6162,8.4,10.26z',
  monument: 'M7.5,0L6,2.5v7h3v-7L7.5,0z M3,11.5L3,15h9v-3.5L10.5,10h-6L3,11.5z',
} as const;

interface ServiceIconDef {
  /** Maki icon id — also used as the MapLibre `addImage()` id. */
  icon: keyof typeof MAKI_PATHS;
  /** Fixed color, independent of the active theme. */
  color: string;
}

/** Icon + fixed color per service group. Colors are approximate, not pixel-picked from the game. */
const SERVICE_ICON_DEFS: Record<ServiceGroup, ServiceIconDef> = {
  electricity: { icon: 'industry', color: '#3f51b5' },
  water: { icon: 'water', color: '#29b6f6' },
  waste: { icon: 'waste-basket', color: '#8d6e63' },
  health: { icon: 'hospital', color: '#c62828' },
  fire: { icon: 'fire-station', color: '#f9a825' },
  security: { icon: 'police', color: '#d4af37' },
  education: { icon: 'school', color: '#a1887f' },
  parks: { icon: 'park', color: '#2e7d32' },
  monuments: { icon: 'monument', color: '#607d8b' },
};

/**
 * Maps a building's `itemClass` to its service-icon group, mirroring
 * Cities: Skylines' own service-category HUD tabs.
 * @remarks
 * Only civic-type buildings covered by one of CS1's 10 HUD categories get an
 * icon. Buildings not in this table (e.g. `Post Office`, `Road Maintenance
 * Facility` — not part of those 10 categories) render without one, same as
 * before this feature.
 */
const ITEM_CLASS_SERVICE_GROUP: Readonly<Record<string, ServiceGroup>> = {
  'Electricity Facility': 'electricity',
  'Electricity Wind Turbine': 'electricity',
  'Water Facility': 'water',
  'Garbage Facility': 'waste',
  'Garbage Recycling': 'waste',
  'Waste Collection': 'waste',
  'Waste Transfer': 'waste',
  'HealthCare Facility': 'health',
  'Childcare Facility': 'health',
  'Eldercare Facility': 'health',
  'DeathCare Facility': 'health',
  'Medical Helicopter': 'health',
  'Fire Department Facility': 'fire',
  'Fire Helicopter': 'fire',
  'Disaster Response': 'fire',
  Shelter: 'fire',
  'Police Department Facility': 'security',
  'Police Helicopter': 'security',
  'Prison Facility': 'security',
  Bank: 'security',
  'Elementary School': 'education',
  'High School': 'education',
  University: 'education',
  'Player University': 'education',
  'Player Trade School': 'education',
  'Player Varsity Sports': 'education',
  Library: 'education',
  'Parks Item': 'parks',
  'Monument Facility': 'monuments',
  'Monument - UpgradeLevel3': 'monuments',
  'Hadron Collider': 'monuments',
  'Space Elevator': 'monuments',
};

/** Resolves a building's service-icon group from its `itemClass`, or `null` if it has none. */
export function resolveServiceGroup(itemClass: string): ServiceGroup | null {
  return ITEM_CLASS_SERVICE_GROUP[itemClass] ?? null;
}

/** Every service group with an icon — the MapLibre image ids to register, and the layer's filter list. */
export const SERVICE_GROUPS = Object.keys(SERVICE_ICON_DEFS) as ServiceGroup[];

/**
 * Builds the recolored `<svg>` markup for a service icon: the group's color
 * as a rounded-square background with a white glyph on top.
 *
 * @remarks
 * Structure copied from the Maki "meta" icon export (background + stroke
 * props) — see `assets/maki-icons/*.svg` — with the background rect's fill
 * swapped for the group's fixed color instead of its default `#000`.
 */
export function buildServiceIconSvg(group: ServiceGroup): string {
  const { icon, color } = SERVICE_ICON_DEFS[group];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 21 21"><rect x="1" y="1" rx="4" ry="4" width="19" height="19" fill="#fff" stroke="#fff" stroke-width="2"/><rect x="1" y="1" rx="4" ry="4" width="19" height="19" fill="${color}"/><path fill="#fff" transform="translate(3 3)" d="${MAKI_PATHS[icon]}"/></svg>`;
}

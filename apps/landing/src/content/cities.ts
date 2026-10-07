/**
 * Cities shown on the landing (backlog D4). Third-party Workshop cities carry
 * credit and a link to their item.
 */
export interface City {
  /** Name as it appears in the game and in the captions. */
  city: string;
  /**
   * Author of the Workshop item or own city. `null` while Sebas has not
   * provided it: the credit then shows a visible "author pending" marker.
   */
  author: string | null;
  origin: 'workshop' | 'own' | 'game';
  workshopId?: string;
  /** Explicit permission of the author to show the city. */
  permission: 'granted' | 'requested' | 'no' | 'not-applicable';
}

export type CityId =
  | 'springValley'
  | 'islandHopping'
  | 'sanRico'
  | 'westdale'
  | 'costaTijuca'
  | 'pepperLake';

export const CITIES: Record<CityId, City> = {
  springValley: {
    city: 'Spring Valley',
    author: null,
    origin: 'workshop',
    workshopId: '1273431737',
    permission: 'no',
  },
  islandHopping: {
    city: 'Island Hopping',
    author: null,
    origin: 'workshop',
    workshopId: '2475283323',
    permission: 'no',
  },
  sanRico: {
    city: 'San Rico',
    author: null,
    origin: 'workshop',
    workshopId: '3000569752',
    permission: 'no',
  },
  westdale: {
    city: '웨스트데일 (Westdale)',
    author: null,
    origin: 'workshop',
    workshopId: '3543847424',
    permission: 'no',
  },
  costaTijuca: {
    city: 'Costa Tijuca',
    // Permission given by the author on Instagram (@barbosacities), 2026-10-07.
    author: 'MatBarbosa',
    origin: 'workshop',
    workshopId: '3346079784',
    permission: 'granted',
  },
  pepperLake: {
    city: 'Pepper Lake',
    author: null,
    origin: 'workshop',
    workshopId: '1568162351',
    permission: 'no',
  },
};

/** Steam Workshop page of a city, or `null` for cities outside the Workshop. */
export function workshopUrl(city: City): string | null {
  return city.workshopId
    ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${city.workshopId}`
    : null;
}

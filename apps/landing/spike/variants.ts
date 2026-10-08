import type {
  EmbedAppearance,
  EmbedPlatform,
} from '../src/components/app-embed/types';

export type { EmbedAppearance, EmbedPlatform };

/** One compared rendering of the components. */
export interface SpikeVariant {
  id: string;
  platform: EmbedPlatform;
  appearance: EmbedAppearance;
}

/** The variants the spike compares, all in English. */
export const SPIKE_VARIANTS: readonly SpikeVariant[] = [
  { id: 'linux-light', platform: 'linux', appearance: 'light' },
  { id: 'macos-light', platform: 'macos', appearance: 'light' },
  { id: 'linux-dark', platform: 'linux', appearance: 'dark' },
];

/** Frame widths, shared by the embed and the reference pages. */
export const FRAME_WIDTH = {
  /** The macOS sidebar width the panel lives in (`--shell-sidebar-expanded-width`). */
  panel: 272,
  /** The card's own 320 px plus the frame padding. */
  card: 352,
} as const;

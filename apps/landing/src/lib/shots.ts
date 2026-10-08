import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import type { Lang } from '../content/routes';
import { SHOTS, type ShotEntry, type ShotId } from '../content/shots';
import { pickShotFile } from './shot-file';

type ImageModule = { default: ImageMetadata };

// Final shots Sebas delivers, named as in LISTA-DE-TOMAS.md (PNG originals are
// converted to WebP at build time). Shots with UI text come per language
// (`-en` / `-es`).
const finals = import.meta.glob<ImageModule>(
  '../assets/shots/*.{png,webp,jpg,jpeg,avif}',
  { eager: true },
);
const standIns = import.meta.glob<ImageModule>('../assets/standins/*.webp', {
  eager: true,
});

/** File name without its folder and extension → image. */
function byName(modules: Record<string, ImageModule>) {
  const images = new Map<string, ImageMetadata>();
  for (const [path, module] of Object.entries(modules)) {
    const file = path.slice(path.lastIndexOf('/') + 1);
    images.set(file.slice(0, file.lastIndexOf('.')), module.default);
  }
  return images;
}

const finalImages = byName(finals);
const standInImages = byName(standIns);
const finalNames = [...finalImages.keys()];
const standInNames = [...standInImages.keys()];

/** A shot as the page can show it today. */
export type ResolvedShot =
  | {
      status: 'final' | 'stand-in';
      entry: ShotEntry;
      image: ImageMetadata;
      alt: string;
    }
  | { status: 'missing'; entry: ShotEntry };

/** Finds the final file of a shot, else its stand-in, else marks it missing. */
export function resolveShot(id: ShotId, lang: Lang): ResolvedShot {
  const entry: ShotEntry = SHOTS[id];
  const choice = pickShotFile(entry, lang, finalNames, standInNames);
  if (choice.kind === 'final')
    return {
      status: 'final',
      entry,
      image: finalImages.get(choice.name) as ImageMetadata,
      alt: entry.alt[lang],
    };
  if (choice.kind === 'stand-in' && entry.standIn)
    return {
      status: 'stand-in',
      entry,
      image: standInImages.get(choice.name) as ImageMetadata,
      alt: entry.standIn.alt[lang],
    };
  return { status: 'missing', entry };
}

/** Responsive WebP sources of an image, for `<img>` and for islands. */
export interface ImageSources {
  src: string;
  srcset: string;
  width: number;
  height: number;
}

/** Widths generated for each use (never wider than the original). */
export async function imageSources(
  image: ImageMetadata,
  widths: number[],
): Promise<ImageSources> {
  const usable = widths.filter((width) => width <= image.width);
  if (usable.length === 0) usable.push(image.width);
  const result = await getImage({
    src: image,
    format: 'webp',
    quality: 82,
    widths: usable,
    width: usable[usable.length - 1],
  });
  return {
    src: result.src,
    srcset: result.srcSet.attribute,
    width: image.width,
    height: image.height,
  };
}

/** What an island needs to show one shot. */
export interface ShotData {
  id: string;
  status: ResolvedShot['status'];
  alt: string;
  pending: string;
  sources: ImageSources | null;
}

export async function shotData(
  id: ShotId,
  lang: Lang,
  widths: number[],
): Promise<ShotData> {
  const shot = resolveShot(id, lang);
  return {
    id: shot.entry.id,
    status: shot.status,
    alt: shot.status === 'missing' ? '' : shot.alt,
    pending: shot.entry.pending[lang],
    sources:
      shot.status === 'missing' ? null : await imageSources(shot.image, widths),
  };
}

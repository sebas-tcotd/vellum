/**
 * Streams a {@link CartographicScene} out as SVG, one bounded chunk at a time.
 *
 * @remarks
 * A generator, not a string builder: the document is never assembled in
 * memory, so peak memory tracks one chunk plus the scene rather than the
 * output size. Emitting a 200 MB document costs the same as emitting a 2 MB
 * one.
 *
 * Self-contained by construction — every colour, width, gradient and dash is
 * written inline, there is no `<style>` sheet, no `@font-face`, no `<image>`,
 * and no reference to any URL. Nothing here reads the DOM, MapLibre, Tauri, or
 * React, which is what lets it run inside `svg-export-worker.ts`.
 */

import {
  projectScenePoint,
  SVG_CHUNK_TARGET_BYTES,
  type CartographicScene,
  type SceneEntity,
  type SceneFill,
  type SceneGeometry,
  type SceneGradient,
  type SceneLayer,
  type SceneStroke,
  type SceneSymbolInstance,
} from '@vellum/core';
import { layoutLabels, type PlacedLabel } from './svg-label-layout';
import { SYMBOL_IDS, SYMBOL_VIEWBOX, symbolBody } from './svg-symbol-catalogue';

/** Decimal places kept for projected coordinates. */
const COORDINATE_PRECISION = 2;

/** Id of the clip path bounding every drawn element to the output area. */
const CLIP_PATH_ID = 'vellum-document-clip';

/**
 * Serializes a scene into ordered XML fragments.
 *
 * @remarks
 * Concatenating every yielded fragment, in order, produces the complete
 * document. Fragments are cut on element boundaries and accumulate to roughly
 * {@link SVG_CHUNK_TARGET_BYTES} before being released, so a chunk is never
 * split mid-tag and the caller never has to re-join anything.
 *
 * @param scene - The neutral scene to serialize.
 * @param chunkTargetBytes - Ceiling for one chunk's UTF-8 byte length.
 * @yields XML fragments in document order.
 */
export function* serializeSceneToSvg(
  scene: CartographicScene,
  chunkTargetBytes: number = SVG_CHUNK_TARGET_BYTES,
): Generator<string, void, undefined> {
  const buffer = new ChunkBuffer(chunkTargetBytes);

  for (const fragment of documentFragments(scene, buffer.fragmentLimit)) {
    const ready = buffer.push(fragment);
    if (ready !== null) yield ready;
  }
  const tail = buffer.flush();
  if (tail !== null) yield tail;
}

/** Every fragment of the document, in order, before chunk assembly. */
function* documentFragments(
  scene: CartographicScene,
  fragmentLimit: number,
): Generator<string, void, undefined> {
  const { width, height } = scene.projection;
  yield '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
  yield `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ` +
    `width="${number(width)}" height="${number(height)}" ` +
    `viewBox="0 0 ${number(width)} ${number(height)}">\n`;

  // Accessible metadata first, so a reader (or a screen reader) meets it
  // before the geometry. Only the city name and a fixed sentence — never a
  // source or destination path.
  yield `<title>${attribute(scene.info.title)}</title>\n`;
  yield `<desc>${attribute(scene.info.description)}</desc>\n`;

  yield* defsFragments(scene, width, height);

  if (scene.background !== null) {
    // A rect, not a CSS background: an SVG document has no page behind it, so
    // a transparent export is simply this element being absent.
    yield `<rect id="vellum-background" x="0" y="0" width="${number(width)}" ` +
      `height="${number(height)}" fill="${attribute(scene.background)}"/>\n`;
  }

  // Everything cartographic is clipped to the output area. A `viewBox` alone
  // only chooses what is *shown*; a stroke centred on the boundary still
  // half-draws outside it, and an editor that widens the canvas would reveal
  // geometry the export never meant to publish.
  yield `<g id="vellum-map" clip-path="url(#${CLIP_PATH_ID})">\n`;
  for (const layer of scene.layers) {
    yield* layerFragments(layer, scene, fragmentLimit);
  }
  yield* symbolInstanceFragments(scene);
  yield* labelFragments(scene);
  yield '</g>\n';

  yield* emblemFragments(scene.emblem);

  yield '</svg>';
}

/**
 * Emits the single `<defs>` block, before anything that references it.
 *
 * @remarks
 * Always present, because the clip path is not optional. Definitions have to
 * precede their first use for a streaming consumer to resolve them without
 * buffering, which is the reason this is the first thing after the metadata.
 */
function* defsFragments(
  scene: CartographicScene,
  width: number,
  height: number,
): Generator<string, void, undefined> {
  yield '<defs>\n';
  yield `<clipPath id="${CLIP_PATH_ID}"><rect x="0" y="0" ` +
    `width="${number(width)}" height="${number(height)}"/></clipPath>\n`;

  // The whole catalogue is declared, not just the modes in use: a designer
  // opening the file can drop in a marker for a mode this city lacks, and the
  // cost is a few hundred bytes once.
  for (const id of SYMBOL_IDS) {
    yield `<symbol id="${attribute(id)}" viewBox="0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}">` +
      `${symbolBody(id)}</symbol>\n`;
  }

  yield* gradientFragments(scene.gradients);
  yield '</defs>\n';
}

function* gradientFragments(
  gradients: readonly SceneGradient[],
): Generator<string, void, undefined> {
  for (const gradient of gradients) {
    // Vertical ramp: the hypsometric palette reads low-to-high top to bottom,
    // which is how a legend presents it and how an editor expects to grab it.
    yield `<linearGradient id="${attribute(gradient.id)}" x1="0" y1="1" x2="0" y2="0">`;
    for (const stop of gradient.stops) {
      yield `<stop offset="${number(stop.offset)}" stop-color="${attribute(stop.color)}"/>`;
    }
    yield '</linearGradient>\n';
  }
}

/**
 * Emits the watermark above every layer, as real vector paths.
 *
 * @remarks
 * Placed outside the layer groups so hiding every map layer still leaves the
 * mark visible, and so a user deleting it does not have to find it nested
 * inside cartography it is not part of.
 *
 * The artwork is scaled by a transform rather than by rewriting its
 * coordinates: the mark is bundled markup, and re-emitting it verbatim under
 * a transform is both exact and the only way to keep its Bézier curves.
 */
function* emblemFragments(
  emblem: CartographicScene['emblem'],
): Generator<string, void, undefined> {
  if (!emblem) return;
  const scale =
    emblem.sourceWidth > 0 ? emblem.widthPx / emblem.sourceWidth : 0;
  if (scale <= 0) return;
  const opacity =
    emblem.opacity === undefined ? '' : ` opacity="${number(emblem.opacity)}"`;
  yield `<g id="${attribute(emblem.id)}"${opacity} transform="translate(${number(
    emblem.xPx,
  )} ${number(emblem.yPx)}) scale(${number(scale)})">\n`;
  yield emblem.svgMarkup;
  yield '\n</g>\n';
}

/**
 * Emits one `<g>` per symbol instance, each wrapping a `<use>`.
 *
 * @remarks
 * The wrapper is what makes instances independently editable: `<use>` alone
 * would give every marker the same identity, so restyling one would look like
 * restyling all of them. The group carries the id and the colour; the shared
 * definition inherits the colour through `currentColor`.
 */
function* symbolInstanceFragments(
  scene: CartographicScene,
): Generator<string, void, undefined> {
  if (scene.symbols.length === 0) return;
  yield '<g id="vellum-symbols">\n';
  for (const instance of scene.symbols) {
    yield symbolInstanceElement(instance, scene);
  }
  yield '</g>\n';
}

function symbolInstanceElement(
  instance: SceneSymbolInstance,
  scene: CartographicScene,
): string {
  const at = projectScenePoint(scene.projection, instance.at);
  const half = instance.sizePx / 2;
  return (
    `<g id="${attribute(instance.id)}" data-layer="${attribute(instance.layer)}" ` +
    `data-entity="${attribute(instance.entityId)}" color="${attribute(instance.color)}">` +
    `<use href="#${attribute(instance.symbol)}" x="${number(at.x - half)}" ` +
    `y="${number(at.y - half)}" width="${number(instance.sizePx)}" ` +
    `height="${number(instance.sizePx)}"/></g>\n`
  );
}

/**
 * Emits every surviving label as an editable `<text>` element.
 *
 * @remarks
 * The halo is a second `<text>` drawn underneath with a stroke, not a filter
 * and never a raster: both copies stay selectable and restylable, and a viewer
 * without filter support still gets readable text. `paint-order` would express
 * it in one element, but support for it is uneven in design tools, and two
 * elements degrade more predictably than one that renders wrong.
 */
function* labelFragments(
  scene: CartographicScene,
): Generator<string, void, undefined> {
  const layout = layoutLabels(scene.labels, scene.projection);
  if (layout.placed.length === 0) return;
  yield '<g id="vellum-labels">\n';
  for (const placed of layout.placed) {
    yield* labelElement(placed);
  }
  yield '</g>\n';
}

function* labelElement(
  placed: PlacedLabel,
): Generator<string, void, undefined> {
  const { label, xPx, yPx, textAnchor } = placed;
  const { style } = label;
  const common =
    `x="${number(xPx)}" y="${number(yPx)}" text-anchor="${textAnchor}" ` +
    `font-family="${attribute(style.fontFamily)}" ` +
    `font-size="${number(style.fontSizePx)}" ` +
    `font-weight="${number(style.fontWeight)}"`;
  const provenance = ` data-layer="${attribute(label.layer)}" data-entity="${attribute(label.entityId)}"`;
  const text = attribute(label.text);

  yield `<g id="${attribute(label.id)}"${provenance}>`;
  if (style.haloColor !== undefined && style.haloWidthPx !== undefined) {
    yield `<text ${common} fill="${attribute(style.haloColor)}" ` +
      `stroke="${attribute(style.haloColor)}" ` +
      `stroke-width="${number(style.haloWidthPx)}" stroke-linejoin="round" ` +
      `aria-hidden="true">${text}</text>`;
  }
  yield `<text ${common} fill="${attribute(style.color)}">${text}</text></g>\n`;
}

function* layerFragments(
  layer: SceneLayer,
  scene: CartographicScene,
  fragmentLimit: number,
): Generator<string, void, undefined> {
  const hidden = layer.visible ? '' : ' display="none"';
  yield `<g id="vellum-layer-${attribute(layer.id)}"${hidden}>\n`;
  for (const entity of layer.entities) {
    yield* entityFragments(entity, scene, fragmentLimit);
  }
  yield '</g>\n';
}

/**
 * Emits one entity as a sequence of small fragments.
 *
 * @remarks
 * A generator, not a single string, because one entity can be enormous: a
 * full-map coastline is a single `<path>` with tens of thousands of points,
 * easily past the 1 MiB chunk ceiling on its own. Yielding its `d` data in
 * batches lets {@link ChunkBuffer} cut anywhere, so no chunk is ever forced
 * over the wire-frame limit by one indivisible fragment.
 */
function* entityFragments(
  entity: SceneEntity,
  scene: CartographicScene,
  fragmentLimit: number,
): Generator<string, void, undefined> {
  const style = `${fillAttributes(entity.fill)}${strokeAttributes(entity.stroke)}`;
  const id = ` id="${attribute(entity.id)}"`;
  const { geometry } = entity;

  if (geometry.kind === 'circle') {
    const center = projectScenePoint(scene.projection, geometry.center);
    yield `<circle${id} cx="${number(center.x)}" cy="${number(center.y)}" ` +
      `r="${number(geometry.radiusPx)}"${style}/>\n`;
    return;
  }
  yield `<path${id} d="`;
  yield* pathDataFragments(geometry, scene, fragmentLimit);
  yield `"${style}/>\n`;
}

/**
 * Streams the `d` attribute for a polyline or a multi-ring polygon.
 *
 * @remarks
 * Batched by *bytes* rather than by a fixed vertex count: the budget that
 * matters is the wire frame's, so a fragment has to be bounded in the same
 * unit the frame is measured in. A fixed point count would still overflow a
 * small budget and waste a large one.
 *
 * `d` data is safe to split between commands — unlike an element, which
 * cannot be cut mid-tag — so this is the one place the document can be
 * divided arbitrarily finely.
 */
function* pathDataFragments(
  geometry: Exclude<SceneGeometry, { kind: 'circle' }>,
  scene: CartographicScene,
  fragmentLimit: number,
): Generator<string, void, undefined> {
  const rings =
    geometry.kind === 'polygon' ? geometry.rings : [geometry.points];
  let batch: string[] = [];
  let batchBytes = 0;
  let first = true;

  for (const ring of rings) {
    let command = 'M';
    for (const point of ring) {
      const projected = projectScenePoint(scene.projection, point);
      const piece = `${first ? '' : ' '}${command}${number(projected.x)} ${number(projected.y)}`;
      first = false;
      command = 'L';
      // Release before overflowing, and only when there is something to
      // release, so a single oversized piece still makes progress.
      if (batchBytes > 0 && batchBytes + piece.length > fragmentLimit) {
        yield batch.join('');
        batch = [];
        batchBytes = 0;
      }
      batch.push(piece);
      batchBytes += piece.length;
    }
    if (geometry.kind === 'polygon') {
      batch.push(' Z');
      batchBytes += 2;
    }
  }
  if (batch.length > 0) yield batch.join('');
}

function fillAttributes(fill: SceneFill | undefined): string {
  // Explicit `fill="none"` matters: SVG's default fill is black, so an
  // unstyled stroked path would come out as a solid blob.
  if (!fill) return ' fill="none"';
  const paint = fill.gradientId
    ? `url(#${attribute(fill.gradientId)})`
    : attribute(fill.color);
  let out = ` fill="${paint}"`;
  if (fill.opacity !== undefined)
    out += ` fill-opacity="${number(fill.opacity)}"`;
  if (fill.fillRule !== undefined) out += ` fill-rule="${fill.fillRule}"`;
  return out;
}

function strokeAttributes(stroke: SceneStroke | undefined): string {
  if (!stroke) return '';
  let out = ` stroke="${attribute(stroke.color)}" stroke-width="${number(stroke.widthPx)}"`;
  if (stroke.opacity !== undefined) {
    out += ` stroke-opacity="${number(stroke.opacity)}"`;
  }
  if (stroke.lineCap !== undefined)
    out += ` stroke-linecap="${stroke.lineCap}"`;
  if (stroke.lineJoin !== undefined) {
    out += ` stroke-linejoin="${stroke.lineJoin}"`;
  }
  if (stroke.dashPx !== undefined && stroke.dashPx.length > 0) {
    out += ` stroke-dasharray="${stroke.dashPx.map(number).join(' ')}"`;
  }
  return out;
}

/** Formats a number for XML, never emitting `NaN`, `Infinity`, or `-0`. */
function number(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(COORDINATE_PRECISION));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/**
 * Escapes a string for use inside a double-quoted XML attribute.
 *
 * @remarks
 * District and building names come from user-authored `.cslmap` files and can
 * contain `&`, `<`, `"` — any of which produces an unparseable document if
 * written verbatim. `&` must be replaced first or it would re-escape the
 * ampersands the later replacements introduce.
 */
export function attribute(value: string): string {
  return (
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // Control characters are illegal in XML 1.0 even when escaped; there is no
      // representation for them, so they are dropped rather than smuggled in.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}

/**
 * Accumulates fragments and releases them once they reach the target size.
 *
 * @remarks
 * The budget is counted in **UTF-8 bytes**, not UTF-16 code units, because
 * that is what the wire frame and the Rust session measure. A city name full
 * of accents would otherwise let a chunk exceed a limit it appeared to
 * respect.
 *
 * Counting is incremental: only the non-ASCII characters of each fragment are
 * measured, so the common all-ASCII path stays a length lookup rather than a
 * full re-encode per fragment.
 */
class ChunkBuffer {
  private readonly target: number;
  private parts: string[] = [];
  private bytes = 0;

  constructor(target: number) {
    // A non-positive target would release a chunk per fragment, which is
    // correct but pathologically chatty over IPC.
    this.target = target > 0 ? target : SVG_CHUNK_TARGET_BYTES;
  }

  /**
   * Largest fragment a producer may hand this buffer.
   *
   * @remarks
   * Equal to the chunk target: `push` releases the pending chunk before
   * adding a fragment that would overflow, so a fragment of exactly this size
   * always fits in a chunk of its own. Anything larger would be unsplittable
   * and force an over-budget chunk.
   */
  get fragmentLimit(): number {
    return this.target;
  }

  /**
   * Adds a fragment, returning a chunk when the buffer would otherwise
   * overflow.
   *
   * @remarks
   * The pending chunk is released *before* the fragment that would push it
   * past the target, not after. Releasing afterwards means a chunk always
   * ends up `target + last fragment` bytes, which Rust rejects for exceeding
   * the `maxChunkBytes` it reported.
   */
  push(fragment: string): string | null {
    const size = utf8Length(fragment);
    let ready: string | null = null;
    if (this.bytes > 0 && this.bytes + size > this.target) {
      ready = this.take();
    }
    this.parts.push(fragment);
    this.bytes += size;
    return ready;
  }

  /** Releases whatever is left; `null` when nothing is pending. */
  flush(): string | null {
    return this.bytes > 0 ? this.take() : null;
  }

  private take(): string {
    const chunk = this.parts.join('');
    this.parts = [];
    this.bytes = 0;
    return chunk;
  }
}

/** UTF-8 byte length of a string, without allocating an encoded copy. */
function utf8Length(value: string): number {
  let bytes = value.length;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) continue;
    // Surrogate pairs already cost 2 UTF-16 units for a 4-byte character, so
    // the lead surrogate adds the remaining 2 and the trail adds nothing.
    if (code < 0x800) bytes += 1;
    else if (code < 0xd800 || code >= 0xe000) bytes += 2;
    else if (code < 0xdc00) bytes += 2;
  }
  return bytes;
}

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
} from '@vellum/core';

/** Decimal places kept for projected coordinates. */
const COORDINATE_PRECISION = 2;

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
 * @param chunkTargetBytes - Soft ceiling for one fragment's UTF-16 length.
 * @yields XML fragments in document order.
 */
export function* serializeSceneToSvg(
  scene: CartographicScene,
  chunkTargetBytes: number = SVG_CHUNK_TARGET_BYTES,
): Generator<string, void, undefined> {
  const buffer = new ChunkBuffer(chunkTargetBytes);

  for (const fragment of documentFragments(scene)) {
    const ready = buffer.push(fragment);
    if (ready !== null) yield ready;
  }
  const tail = buffer.flush();
  if (tail !== null) yield tail;
}

/** Every fragment of the document, in order, before chunk assembly. */
function* documentFragments(
  scene: CartographicScene,
): Generator<string, void, undefined> {
  const { width, height } = scene.projection;
  yield '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
  yield `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ` +
    `width="${number(width)}" height="${number(height)}" ` +
    `viewBox="0 0 ${number(width)} ${number(height)}">\n`;

  yield* defsFragments(scene.gradients);

  if (scene.background !== null) {
    // A rect, not a CSS background: an SVG document has no page behind it, so
    // a transparent export is simply this element being absent.
    yield `<rect id="vellum-background" x="0" y="0" width="${number(width)}" ` +
      `height="${number(height)}" fill="${attribute(scene.background)}"/>\n`;
  }

  for (const layer of scene.layers) {
    yield* layerFragments(layer, scene);
  }

  yield '</svg>';
}

function* defsFragments(
  gradients: readonly SceneGradient[],
): Generator<string, void, undefined> {
  if (gradients.length === 0) return;
  yield '<defs>\n';
  for (const gradient of gradients) {
    // Vertical ramp: the hypsometric palette reads low-to-high top to bottom,
    // which is how a legend presents it and how an editor expects to grab it.
    yield `<linearGradient id="${attribute(gradient.id)}" x1="0" y1="1" x2="0" y2="0">`;
    for (const stop of gradient.stops) {
      yield `<stop offset="${number(stop.offset)}" stop-color="${attribute(stop.color)}"/>`;
    }
    yield '</linearGradient>\n';
  }
  yield '</defs>\n';
}

function* layerFragments(
  layer: SceneLayer,
  scene: CartographicScene,
): Generator<string, void, undefined> {
  const hidden = layer.visible ? '' : ' display="none"';
  yield `<g id="vellum-layer-${attribute(layer.id)}"${hidden}>\n`;
  for (const entity of layer.entities) {
    yield entityElement(entity, scene);
  }
  yield '</g>\n';
}

function entityElement(entity: SceneEntity, scene: CartographicScene): string {
  const style = `${fillAttributes(entity.fill)}${strokeAttributes(entity.stroke)}`;
  const id = ` id="${attribute(entity.id)}"`;
  const { geometry } = entity;

  if (geometry.kind === 'circle') {
    const center = projectScenePoint(scene.projection, geometry.center);
    return (
      `<circle${id} cx="${number(center.x)}" cy="${number(center.y)}" ` +
      `r="${number(geometry.radiusPx)}"${style}/>\n`
    );
  }
  return `<path${id} d="${pathData(geometry, scene)}"${style}/>\n`;
}

/** Builds the `d` attribute for a polyline or a multi-ring polygon. */
function pathData(
  geometry: Exclude<SceneGeometry, { kind: 'circle' }>,
  scene: CartographicScene,
): string {
  const rings =
    geometry.kind === 'polygon' ? geometry.rings : [geometry.points];
  const close = geometry.kind === 'polygon' ? 'Z' : '';
  const parts: string[] = [];

  for (const ring of rings) {
    let command = 'M';
    for (const point of ring) {
      const projected = projectScenePoint(scene.projection, point);
      parts.push(`${command}${number(projected.x)} ${number(projected.y)}`);
      command = 'L';
    }
    if (close) parts.push(close);
  }
  return parts.join(' ');
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

/** Accumulates fragments and releases them once they reach the target size. */
class ChunkBuffer {
  private readonly target: number;
  private parts: string[] = [];
  private length = 0;

  constructor(target: number) {
    // A non-positive target would release a chunk per fragment, which is
    // correct but pathologically chatty over IPC.
    this.target = target > 0 ? target : SVG_CHUNK_TARGET_BYTES;
  }

  /** Adds a fragment, returning a chunk when the buffer is full enough. */
  push(fragment: string): string | null {
    this.parts.push(fragment);
    this.length += fragment.length;
    return this.length >= this.target ? this.take() : null;
  }

  /** Releases whatever is left; `null` when nothing is pending. */
  flush(): string | null {
    return this.length > 0 ? this.take() : null;
  }

  private take(): string {
    const chunk = this.parts.join('');
    this.parts = [];
    this.length = 0;
    return chunk;
  }
}

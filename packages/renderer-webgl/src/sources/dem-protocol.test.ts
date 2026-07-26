import { describe, expect, it } from 'vitest';
import {
  DEM_ENCODING,
  DEM_MAX_ZOOM,
  DEM_MIN_ZOOM,
  DEM_PAD_OFFSET,
} from './dem-protocol';
import { CS1_HALF_EXTENT_DEG } from '../coordinate-transform';

/** Reproduces MapLibre's `custom` decode: `R·red + G·green + B·blue − baseShift`. */
function decode(r: number, g: number, b: number): number {
  return (
    r * DEM_ENCODING.redFactor +
    g * DEM_ENCODING.greenFactor +
    b * DEM_ENCODING.blueFactor -
    DEM_ENCODING.baseShift
  );
}

/** Reproduces the Rust packing: `R = raw >> 8`, `G = raw & 0xFF`, `B = 0`. */
function pack(rawUnits: number): [number, number, number] {
  return [rawUnits >> 8, rawUnits & 0xff, 0];
}

describe('DEM encoding contract', () => {
  it('round-trips every elevation the format can hold, in raw game units', () => {
    // 1600 and 40517 are the measured extremes of altavento.cslmap.
    for (const raw of [0, 1600, 13590, 40517, 65535]) {
      expect(decode(...pack(raw))).toBe(raw);
    }
  });

  it('resolves one raw unit, so no elevation detail is lost in transit', () => {
    expect(decode(...pack(1601)) - decode(...pack(1600))).toBe(1);
  });

  it('gives the blue channel sub-unit weight, so the parser leaving it at zero is lossless', () => {
    expect(decode(0, 0, 255)).toBeLessThan(1);
  });

  it('keeps every factor non-zero, or MapLibre packs the colour ramp as NaN', () => {
    // MapLibre packs each colour-relief elevation stop with
    // `round((stop + baseShift) / Math.min(redFactor, greenFactor, blueFactor))`
    // (5.24, the `Rl` helper behind `getColorRampTextures`). A zero factor divides by
    // zero there, every stop becomes NaN, and the shader silently paints the whole map
    // with the ramp's last colour — including the transparent out-of-map sentinel, which
    // is how the terrain used to bleed over the app background.
    const scale = Math.min(
      DEM_ENCODING.redFactor,
      DEM_ENCODING.greenFactor,
      DEM_ENCODING.blueFactor,
    );
    expect(scale).toBeGreaterThan(0);
    expect(
      Number.isFinite(Math.round((1000 + DEM_ENCODING.baseShift) / scale)),
    ).toBe(true);
  });
});

describe('out-of-map padding', () => {
  it('packs the sentinel to a value the ramp can key a transparent stop on', () => {
    // The tile renderer pads with `elevMin - DEM_PAD_OFFSET`; the ramp's first stop sits
    // at exactly that value. Both sides must agree bit for bit or the padding renders
    // opaque and spills past the map extent.
    const elevMin = 9392; // measured land minimum of altavento.cslmap
    const sentinel = elevMin - DEM_PAD_OFFSET;
    expect(decode(...pack(sentinel))).toBe(sentinel);
    expect(decode(...pack(sentinel))).toBeLessThan(elevMin);
  });
});

describe('DEM zoom window', () => {
  it('brackets the zoom at which one tile matches the map extent', () => {
    // A tile spans 360/2^z degrees; the map spans 2·CS1_HALF_EXTENT_DEG.
    const exactZoom = Math.log2(360 / (CS1_HALF_EXTENT_DEG * 2));
    expect(exactZoom).toBeGreaterThan(DEM_MIN_ZOOM);
    expect(exactZoom).toBeLessThan(DEM_MAX_ZOOM);
  });
});

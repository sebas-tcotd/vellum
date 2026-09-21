/**
 * `CsPoint` adapter over the shared, frame-agnostic shape helper.
 *
 * @remarks
 * The corner arithmetic lives once in `../../geometry-kit` so the schematic view
 * can build the same capsule in viewBox units (Story 4.3b). This file only
 * changes the vocabulary; the numbers are the kit's, float for float.
 */
import type { CsPoint } from '../../../coordinate-transform';
import { roundedRectRing as ringOfVec2, type Vec2 } from '../../geometry-kit';

const toVec = (p: CsPoint): Vec2 => [p.x, p.z];
const toCs = (v: Vec2): CsPoint => ({ x: v[0], z: v[1] });

/**
 * A closed rounded-rectangle (stadium/capsule) ring in world space, centered at
 * `center` with local axes `along`/`across` and half-extents `halfAlong`/`halfAcross`. The
 * corner radius is the smaller half-extent, so a marker much longer in one axis
 * becomes a capsule and a near-square one becomes a rounded square. `stepsPerCorner` arc
 * segments approximate each 90° corner.
 */
export function roundedRectRing(
  center: CsPoint,
  along: CsPoint,
  across: CsPoint,
  halfAlong: number,
  halfAcross: number,
  stepsPerCorner: number,
): CsPoint[] {
  return ringOfVec2(
    toVec(center),
    toVec(along),
    toVec(across),
    halfAlong,
    halfAcross,
    stepsPerCorner,
  ).map(toCs);
}

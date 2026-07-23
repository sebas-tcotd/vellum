import type { CsPoint } from '../../../coordinate-transform';
import { add, scale } from './vector';

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
  const cornerRadius = Math.max(0, Math.min(halfAlong, halfAcross));
  const innerAlong = halfAlong - cornerRadius;
  const innerAcross = halfAcross - cornerRadius;

  const toWorldSpace = (offsetAlong: number, offsetAcross: number): CsPoint => {
    const alongVector = scale(along, offsetAlong);
    const acrossVector = scale(across, offsetAcross);
    return add(add(center, alongVector), acrossVector);
  };

  const HALF_PI = Math.PI / 2;
  const corners = [
    { centerU: innerAlong, centerV: innerAcross, startAngle: 0 },
    { centerU: -innerAlong, centerV: innerAcross, startAngle: HALF_PI },
    { centerU: -innerAlong, centerV: -innerAcross, startAngle: Math.PI },
    { centerU: innerAlong, centerV: -innerAcross, startAngle: 3 * HALF_PI },
  ];

  const ring: CsPoint[] = [];
  for (const corner of corners) {
    for (let step = 0; step <= stepsPerCorner; step++) {
      const angle = corner.startAngle + (step / stepsPerCorner) * HALF_PI;
      const localU = corner.centerU + cornerRadius * Math.cos(angle);
      const localV = corner.centerV + cornerRadius * Math.sin(angle);
      ring.push(toWorldSpace(localU, localV));
    }
  }

  ring.push(ring[0]);
  return ring;
}

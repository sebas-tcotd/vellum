/**
 * Inner connections — paper §5 step 3 of {@link buildRenderGeometry}: cubic
 * Bézier curves between the ports of continuing lines, precomputed in world
 * space. Driven by the route-derived transitions rather than corridor
 * line-set membership, so lines that touch 3+ corridors at a node (loops,
 * roundabouts, revisited hubs) still connect correctly.
 */

import type { CsPoint } from '../../../coordinate-transform';
import type { TransitLineGraph } from '../../line-graph';
import { BEZIER_ARM_FACTOR, BEZIER_SAMPLES, SLOT_M } from '../config';
import type { ConnectorGeometry, CorridorGeometry } from '../types';
import { cubicBezier, endDirection } from '../utils/path';
import { add, norm, rightOf, scale, sub } from '../utils/vector';

/** Builds one Bézier connector per route transition between two corridors. */
export function buildConnectors(
  graph: TransitLineGraph,
  corridors: Map<string, CorridorGeometry>,
): ConnectorGeometry[] {
  const connectors: ConnectorGeometry[] = [];

  for (const transition of graph.transitions) {
    const ce = corridors.get(transition.fromEdge);
    const cf = corridors.get(transition.toEdge);
    if (!ce || !cf) continue;
    if (
      !ce.lineIds.includes(transition.lineId) ||
      !cf.lineIds.includes(transition.lineId)
    )
      continue;

    const p = portAt(ce, transition.lineId, transition.fromEnd);
    const q = portAt(cf, transition.lineId, transition.toEnd);
    const distance = norm(sub(q, p));
    if (distance < 1e-6) continue;

    const inwardE =
      transition.fromEnd === 'end'
        ? endDirection(ce.path, 'end')
        : scale(endDirection(ce.path, 'start'), -1);

    const inwardF =
      transition.toEnd === 'end'
        ? endDirection(cf.path, 'end')
        : scale(endDirection(cf.path, 'start'), -1);

    const arm = distance * BEZIER_ARM_FACTOR;
    const path = cubicBezier(
      p,
      add(p, scale(inwardE, arm)),
      add(q, scale(inwardF, arm)),
      q,
      BEZIER_SAMPLES,
    );

    connectors.push({ lineId: transition.lineId, path });
  }

  return connectors;
}

/** Port of `lineId` at the given end of a trimmed corridor. */
function portAt(
  corridor: CorridorGeometry,
  lineId: string,
  at: 'start' | 'end',
): CsPoint {
  const n = corridor.lineIds.length;
  const p = corridor.lineIds.indexOf(lineId);
  const offsetIdx = p - (n - 1) / 2;
  const anchor =
    at === 'start' ? corridor.path[0] : corridor.path[corridor.path.length - 1];
  const dir = endDirection(corridor.path, at);

  return add(anchor, scale(rightOf(dir), offsetIdx * SLOT_M));
}

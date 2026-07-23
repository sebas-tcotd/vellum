import { CsPoint } from '../../../coordinate-transform';
import { LineGraphEdge } from '../types';

const MIN_DISTANCE_FOR_DIRECTION_SQ = 1; // 1^2 = 1

/** The square of the Euclidean distance between two points (in world units). */
export function dist2(a: CsPoint, b: CsPoint): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * Azimuth (radians, atan2 convention) of the departure direction of `edge`
 * when leaving `nodeId`. Uses the first path point at least 1 world unit away
 * to be robust against duplicated vertices.
 */
export function departureAzimuth(edge: LineGraphEdge, nodeId: string): number {
  const path = getOrderedPathPoints(edge, nodeId);
  if (path.length < 2) return 0;

  const startPoint = path[0];
  const targetPoint = findTargetPointForDirection(path, startPoint);

  if (!targetPoint) return 0;

  return calculateAzimuth(startPoint, targetPoint);
}

function getOrderedPathPoints(
  edge: LineGraphEdge,
  leavingFromNodeId: string,
): ReadonlyArray<CsPoint> {
  const isLeavingFromStart = edge.nodeA === leavingFromNodeId;
  return isLeavingFromStart ? edge.path : edge.path.slice().reverse();
}

function findTargetPointForDirection(
  path: ReadonlyArray<CsPoint>,
  startPoint: CsPoint,
): CsPoint | null {
  for (let i = 1; i < path.length; i++) {
    if (dist2(path[i], startPoint) > MIN_DISTANCE_FOR_DIRECTION_SQ) {
      return path[i];
    }
  }
  return null;
}

function calculateAzimuth(from: CsPoint, to: CsPoint): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(dz, dx);
}

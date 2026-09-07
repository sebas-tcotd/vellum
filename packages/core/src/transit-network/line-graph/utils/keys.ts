/** Composite key for `TransitLineGraph.continuationIndex`. */
export function continuationKey(
  nodeId: string,
  edgeId: string,
  bundleId: string,
): string {
  return `${nodeId}\0${edgeId}\0${bundleId}`;
}

/** Deterministic key for a sorted set of line ids, used to compare line sets. */
export function keyOfLineSet(lineIds: string[]): string {
  return lineIds.join('\0');
}

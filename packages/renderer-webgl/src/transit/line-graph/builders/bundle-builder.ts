/**
 * Bundle collapse — pruning rule 2 (Lemma 4.1) of {@link buildTransitLineGraph}:
 * lines that always occur together across the base graph are collapsed into
 * a single bundle, so the ordering problem operates on bundles of weight k
 * rather than individual lines.
 */

import type { BaseSegment, LineBundle } from '../types';
import { getOrCreate } from '../utils/collections';

/** Result of {@link collapseBundles}. */
export interface BundleResult {
  /** Bundles keyed by bundle id. */
  bundles: Map<string, LineBundle>;
  /** Bundle id for each line id. */
  bundleOfLine: Map<string, string>;
}

/**
 * Groups lines with identical segment membership into bundles (Lemma 4.1).
 * Bundle id is the lexicographically smallest member line id.
 */
export function collapseBundles(
  baseSegs: Map<string, BaseSegment>,
): BundleResult {
  const segsOfLine = new Map<string, string[]>();

  for (const [segId, bs] of baseSegs) {
    for (const lineId of bs.lineIds) {
      getOrCreate(segsOfLine, lineId, () => []).push(segId);
    }
  }

  const bundles = new Map<string, LineBundle>();
  const bundleOfLine = new Map<string, string>();
  const bySignature = new Map<string, string[]>();

  for (const lineId of [...segsOfLine.keys()].sort()) {
    const sig = (segsOfLine.get(lineId) ?? []).sort().join('\0');
    getOrCreate(bySignature, sig, () => []).push(lineId);
  }

  for (const members of bySignature.values()) {
    members.sort();
    const bundle: LineBundle = {
      id: members[0],
      lineIds: members,
      weight: members.length,
    };
    bundles.set(bundle.id, bundle);
    for (const m of members) {
      bundleOfLine.set(m, bundle.id);
    }
  }

  return { bundles, bundleOfLine };
}

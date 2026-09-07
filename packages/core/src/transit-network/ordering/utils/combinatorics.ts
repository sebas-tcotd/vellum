/** Permutation generation and candidate-order enumeration for the search algorithms. */

import { MAX_PERMS_PER_EDGE } from '../constants';

/** Heap's algorithm — yields all permutations of `items` (small n only). */
export function* permutations(items: string[]): Generator<string[]> {
  const arr = [...items];
  const counters = new Array<number>(arr.length).fill(0);

  yield [...arr];

  let i = 0;
  while (i < arr.length) {
    if (counters[i] < i) {
      const swapIndex = i % 2 === 0 ? 0 : counters[i];

      [arr[swapIndex], arr[i]] = [arr[i], arr[swapIndex]];

      yield [...arr];

      counters[i]++;
      i = 0;
    } else {
      counters[i] = 0;
      i++;
    }
  }
}

export function factorial(n: number): number {
  if (n < 2) return 1;

  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

const MAX_PERMUTATIONS_FULL = MAX_PERMS_PER_EDGE;

/** Candidate orderings for one edge: all permutations, or adjacent swaps for large bundles. */
export function candidateOrders(current: string[]): string[][] {
  if (factorial(current.length) <= MAX_PERMUTATIONS_FULL) {
    return [...permutations(current)];
  }

  const candidates: string[][] = [current];

  for (let i = 0; i + 1 < current.length; i++) {
    const swapped = [...current];
    [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    candidates.push(swapped);
  }

  return candidates;
}

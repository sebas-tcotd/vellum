import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS class names, resolving conflicts via `tailwind-merge`
 * and handling conditional classes via `clsx`.
 *
 * @param inputs - Class values to merge (strings, arrays, objects).
 * @returns A single merged class name string.
 * @example
 * cn('px-2 py-1', isActive && 'bg-blue-500', 'px-4')
 * // → 'py-1 bg-blue-500 px-4'  (px-2 overridden by px-4)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

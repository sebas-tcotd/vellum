import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges simple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional falsy values', () => {
    expect(cn('base', false && 'skip', null, undefined, 'end')).toBe(
      'base end',
    );
  });

  it('resolves Tailwind conflicts — last padding wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('resolves Tailwind conflicts — last bg wins', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('handles object syntax from clsx', () => {
    expect(cn({ 'text-bold': true, 'text-italic': false })).toBe('text-bold');
  });

  it('handles array syntax', () => {
    expect(cn(['flex', 'items-center'])).toBe('flex items-center');
  });

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { readableInk } from './color-mix';

describe('readableInk — street-label auto-tint', () => {
  it('keeps the theme ink while it reads on the road', () => {
    // Day local street: brown ink on a light sand road.
    expect(readableInk('#4a3f33', '#c7b79d')).toBe('#4a3f33');
  });

  it('turns light on a dark road', () => {
    // Day highway: the same brown ink on a dark brown road.
    expect(readableInk('#4a3f33', '#8a7056')).toBe('#ffffff');
  });

  it('turns dark on a light road', () => {
    // A light ink (dark theme) that lands on a pale road.
    expect(readableInk('#e0e0e0', '#dcdcdc')).toBe('#1c1c1c');
  });

  it('leaves unparseable colours alone', () => {
    expect(readableInk('rebeccapurple', '#000000')).toBe('rebeccapurple');
  });
});

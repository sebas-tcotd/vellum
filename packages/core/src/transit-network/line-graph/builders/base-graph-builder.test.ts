import { describe, expect, it } from 'vitest';
import { displayLineName } from './base-graph-builder';

describe('displayLineName', () => {
  it('reads the asset out of a localization key the player never replaced', () => {
    expect(displayLineName('TRANSPORT_LINE_PATTERN[Evacuation Bus]:0')).toBe(
      'Evacuation Bus',
    );
  });

  it('drops the pattern index even when it is absent', () => {
    expect(displayLineName('TRANSPORT_LINE_PATTERN[Ferry]')).toBe('Ferry');
    expect(displayLineName('TRANSPORT_LINE_PATTERN[Ferry]:12')).toBe('Ferry');
  });

  it('leaves a name the player actually chose alone', () => {
    // Brackets are legal in a real name; only a key-shaped string is rewritten.
    expect(displayLineName('Línea de autobús 1')).toBe('Línea de autobús 1');
    expect(displayLineName('Ruta [Norte]')).toBe('Ruta [Norte]');
    expect(displayLineName('M3')).toBe('M3');
  });

  it('passes a blank name through for each surface to word itself', () => {
    expect(displayLineName('')).toBe('');
    expect(displayLineName('   ')).toBe('   ');
  });

  it('keeps a key with nothing readable inside rather than emptying it', () => {
    expect(displayLineName('TRANSPORT_LINE_PATTERN[]:0')).toBe(
      'TRANSPORT_LINE_PATTERN[]:0',
    );
  });
});

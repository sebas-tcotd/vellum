import { describe, expect, it } from 'vitest';
import { act, renderHook } from '../test-utils';
import { makeCityData } from '@vellum/core/testing';
import type { CityData } from '@vellum/core';
import { useResetSessionOnCityChange, useShellSession } from './shell-session';

describe('useResetSessionOnCityChange', () => {
  it('clears the pinned place and the schematic view when the city changes', () => {
    const first = makeCityData({ cityName: 'Uno' });
    const { result, rerender } = renderHook(
      ({ city }: { city: CityData | null }) => {
        const shell = useShellSession(1440);
        useResetSessionOnCityChange(city, shell.dispatch);
        return shell;
      },
      { initialProps: { city: first as CityData | null } },
    );

    act(() =>
      result.current.dispatch({
        type: 'place/select',
        entity: { kind: 'district', id: 'd1' },
      }),
    );
    act(() => result.current.dispatch({ type: 'viewMode/toggle' }));
    act(() =>
      result.current.dispatch({
        type: 'place/select',
        entity: { kind: 'district', id: 'd1' },
      }),
    );
    expect(result.current.state.pinnedEntity).not.toBeNull();

    // Same city, re-rendered: nothing resets.
    rerender({ city: first });
    expect(result.current.state.pinnedEntity).not.toBeNull();

    rerender({ city: makeCityData({ cityName: 'Dos' }) });
    expect(result.current.state.pinnedEntity).toBeNull();
    expect(result.current.state.viewMode).toBe('geographic');
  });
});

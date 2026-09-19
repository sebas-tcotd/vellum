import { renderHook } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it, vi } from 'vitest';
import { IPC_COMMANDS, NEUTRAL_MARGINALIA_LABELS } from '@vellum/core';
import { useExportPng } from './use-export-png';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('useExportPng', () => {
  it('envía bytes PNG tipados sin base64 al comando del contrato', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      filePath: '/tmp/map.png',
      folderPath: '/tmp',
    });
    const { result } = renderHook(() => useExportPng());

    await expect(
      result.current.exportPng(
        {
          format: 'png-2x',
          area: 'viewport',
          background: 'transparent',
          fileName: 'map',
          presentation: {
            showCityName: false,
            showRoadLegend: false,
            showTransitLegend: false,
            showElevationLegend: false,
            showScaleBar: false,
            showOrientation: false,
            showSummary: false,
            showSourceNote: false,
            author: '',
            corner: 'bottom-left',
          },
          labels: NEUTRAL_MARGINALIA_LABELS,
        },
        new Uint8Array([137, 80, 78, 71]),
      ),
    ).resolves.toEqual({ filePath: '/tmp/map.png', folderPath: '/tmp' });

    expect(invoke).toHaveBeenCalledWith(IPC_COMMANDS.EXPORT_PNG, {
      options: expect.objectContaining({
        pngBytes: [137, 80, 78, 71],
        fileName: 'map',
      }),
    });
  });

  it('rechaza SVG antes de invocar el exportador PNG', async () => {
    const { result } = renderHook(() => useExportPng());
    await expect(
      result.current.exportPng(
        {
          format: 'svg',
          area: 'viewport',
          background: 'white',
          fileName: 'map',
          presentation: {} as never,
          labels: {} as never,
        },
        new Uint8Array(),
      ),
    ).rejects.toThrow('non-PNG');
  });
});

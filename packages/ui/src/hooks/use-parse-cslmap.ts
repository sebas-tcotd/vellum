import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useVellumStore } from '../store/vellum-store';
import type { CityData } from '@vellum/core';
import type { VellumError } from '@vellum/core';

export function useParseCslmap() {
  const setLoadingState = useVellumStore((s) => s.setLoadingState);
  const setCityData = useVellumStore((s) => s.setCityData);
  const incrementLoadRequestId = useVellumStore(
    (s) => s.incrementLoadRequestId,
  );

  const loadFile = async (filePath: string): Promise<void> => {
    const requestId = incrementLoadRequestId();
    setLoadingState('loading');

    try {
      const cityData = await invoke<CityData>('parse_cslmap', { filePath });

      if (useVellumStore.getState().loadRequestId !== requestId) return;

      setCityData(cityData);
      setLoadingState('idle');
    } catch (err) {
      if (useVellumStore.getState().loadRequestId !== requestId) return;
      setLoadingState('error', err as VellumError);
    }
  };

  const openFileDialog = async (): Promise<void> => {
    const selected = await open({
      title: 'Abrir ciudad',
      filters: [{ name: 'CSL Map', extensions: ['cslmap'] }],
      multiple: false,
    });

    if (selected === null) return;

    const filePath = typeof selected === 'string' ? selected : selected[0];
    await loadFile(filePath);
  };

  return { loadFile, openFileDialog };
}

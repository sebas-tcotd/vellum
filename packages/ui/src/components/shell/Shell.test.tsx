import { fireEvent, render, screen } from '../../test-utils';
import { describe, expect, it, vi } from 'vitest';
import { DesktopShell } from './DesktopShell';
import { MapSurface } from './MapSurface';
import { ShellSidebar } from './ShellSidebar';

vi.mock('../panels/FloatingLayerPanel', () => ({
  FloatingLayerPanel: ({
    onStateChange,
  }: {
    onStateChange?: (state: 'expanded' | 'collapsed') => void;
  }) => (
    <div data-testid="functional-layer-controls">
      <button type="button" onClick={() => onStateChange?.('collapsed')}>
        collapse
      </button>
      <button type="button" onClick={() => onStateChange?.('expanded')}>
        expand
      </button>
    </div>
  ),
}));

function renderShell(isCleanMode = false) {
  return render(
    <DesktopShell>
      <ShellSidebar
        cityName="Altavento"
        fileName="altavento.cslmap"
        isCleanMode={isCleanMode}
      />
      <MapSurface>
        <div data-testid="map" />
      </MapSurface>
    </DesktopShell>,
  );
}

describe('shell adaptativo inline', () => {
  it('compone un único tool pane como hermano de la superficie de mapa', () => {
    renderShell();

    const shell = screen.getByTestId('desktop-shell');
    const sidebar = screen.getByTestId('shell-sidebar');
    const mapSurface = screen.getByTestId('map-surface');
    expect(shell.children).toContain(sidebar);
    expect(shell.children).toContain(mapSurface);
    expect(screen.getAllByTestId('functional-layer-controls')).toHaveLength(1);
  });

  it('propaga expanded/collapsed al drawer que participa en el layout', () => {
    renderShell();
    const sidebar = screen.getByTestId('shell-sidebar');
    expect(sidebar).toHaveAttribute('data-state', 'expanded');

    fireEvent.click(screen.getByRole('button', { name: 'collapse' }));
    expect(sidebar).toHaveAttribute('data-state', 'collapsed');

    fireEvent.click(screen.getByRole('button', { name: 'expand' }));
    expect(sidebar).toHaveAttribute('data-state', 'expanded');
  });

  it('Clean Mode retira el drawer y conserva el mismo árbol funcional', () => {
    const { rerender } = renderShell();
    const collapseButton = screen.getByRole('button', { name: 'collapse' });
    fireEvent.click(collapseButton);
    collapseButton.focus();

    rerender(
      <DesktopShell>
        <ShellSidebar
          cityName="Altavento"
          fileName="altavento.cslmap"
          isCleanMode
        />
        <MapSurface>
          <div data-testid="map" />
        </MapSurface>
      </DesktopShell>,
    );

    const sidebar = screen.getByTestId('shell-sidebar');
    expect(sidebar).toHaveAttribute('hidden');
    expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    expect(screen.getAllByTestId('functional-layer-controls')).toHaveLength(1);
    expect(document.activeElement).toBe(document.body);

    rerender(
      <DesktopShell>
        <ShellSidebar
          cityName="Altavento"
          fileName="altavento.cslmap"
          isCleanMode={false}
        />
        <MapSurface>
          <div data-testid="map" />
        </MapSurface>
      </DesktopShell>,
    );
    expect(document.activeElement).toBe(collapseButton);
  });

  it('mantiene una región de drag nativa sin reemplazar los controles de ventana', () => {
    const { container } = renderShell();
    const dragRegion = container.querySelector('[data-tauri-drag-region]');
    expect(dragRegion).toBeInTheDocument();
    // No debe tener un valor "false" (que Tauri interpreta como "no es
    // drag region") ni un onMouseDown propio: el script `drag.js` que Tauri
    // inyecta ya escucha `mousedown` en `document` y llama a
    // `start_dragging` por su cuenta en cuanto ve este atributo. Un segundo
    // `startDragging()` manual sobre el mismo click invoca el comando dos
    // veces casi al mismo tiempo — la ventana deja de seguir al cursor a
    // mitad del drag nativo (bug real de Story 8.2, ver DesktopShell.tsx).
    expect(dragRegion).not.toHaveAttribute('data-tauri-drag-region', 'false');
    expect((dragRegion as HTMLElement | null)?.onmousedown).toBeNull();
  });
});

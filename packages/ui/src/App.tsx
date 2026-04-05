import { CanvasRoot } from './components/canvas/CanvasRoot';

/** Componente raíz de la aplicación. Montado desde `apps/desktop/src/main.tsx`. */
export function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <CanvasRoot />
    </div>
  );
}

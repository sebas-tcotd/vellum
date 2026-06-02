# Algoritmo de Renderizado de Tránsito: Path-Based Rendering

Este documento detalla la evolución del algoritmo de renderizado de líneas de transporte público en Vellum, pasando de un modelo basado en segmentos independientes a un modelo basado en rutas continuas (**Path-Based Rendering**).

## 1. Explicación Sencilla (La analogía de la "Cinta")

Imagínate que quieres representar una línea de autobús en un mapa.

- **El problema actual (Segmentado):** Es como si un pintor pintara trozos de calle sueltos. Pinta una "baldosa", limpia el pincel, y luego pinta la siguiente. Como no sabe qué hizo en la baldosa anterior, a veces cambia la línea de lado de la calle o deja huecos en las uniones. Esto causa "saltos" visuales y que las líneas parezcan desconectadas.
- **La solución (Path-Based):** Tratamos cada línea de autobús como una única **"Cinta Larga"**. Primero pegamos todos los trozos de la ruta de principio a fin, nos aseguramos de que todos miren en la misma dirección (el sentido de la marcha) y luego pintamos la cinta completa de un solo trazo. Esto garantiza que la línea sea fluida, no tenga huecos y mantenga siempre su carril.

## 2. Explicación Técnica Exhaustiva

El algoritmo de Path-Based Rendering resuelve tres problemas críticos de la cartografía digital de transportes:

### A. Normalización de Dirección (Directional Consistency)

En los archivos de datos (CSLMap), las carreteras tienen una dirección interna basada en cómo se construyeron en el juego. Si un segmento va de A a B y el siguiente de C a B, la "derecha" cambia de repente.
El algoritmo ahora **normaliza** esto: al recorrer la ruta, detecta si el inicio del segmento coincide con el final del anterior. Si no coincide, invierte el orden de los puntos del segmento para que toda la ruta tenga una dirección vectorial continua.

### B. Continuidad en Nodos (Node Continuity)

Al usar un único trazo (`beginPath` ... `stroke`) para toda la ruta en lugar de uno por segmento, el motor de renderizado (Canvas 2D) aplica automáticamente las reglas de unión de líneas (`lineJoin: 'round'`). Esto elimina los huecos y traslapes en las intersecciones.

### C. Estabilidad de Carriles (Lane Stability)

El sistema calcula un "carril" para cada línea basado en cuántas otras líneas comparten la vía.

- **Cantidades Impares (1, 3, 5...):** Una línea ocupa el centro exacto (offset 0), y las demás se distribuyen simétricamente.
- **Cantidades Pares (2, 4, 6...):** No hay línea central; las líneas se sitúan a izquierda y derecha de un eje imaginario en el centro de la calle.

### D. Casos de Borde

- **Cambio de volumen:** Cuando una ruta pasa de una calle con 5 líneas a una con 2, el algoritmo puede implementar una "rampa" o transición suave para que el cambio de carril no sea un salto brusco.
- **Intersecciones complejas:** Al tratar la ruta como un todo, se puede promediar la dirección en las esquinas para que el desplazamiento lateral (offset) no cause picos extraños.

## 3. Pseudocódigo

```text
PARA CADA Línea de Tránsito (L):
    1. Inicializar lista Puntos_Ruta con la posición de la primera parada.
    2. Nodo_Actual = ID del primer nodo de la ruta.

    3. PARA CADA Segmento_ID en la ruta de L:
        - Obtener datos del Segmento (S).
        - worldPoints = [S.Posicion_Inicio, ...S.Curvatura, S.Posicion_Fin]

        - SI S.ID_Inicio != Nodo_Actual:
            - Invertir worldPoints (Normalización)
            - Nodo_Actual = S.ID_Inicio
        - SINO:
            - Nodo_Actual = S.ID_Fin

        - Añadir worldPoints a Puntos_Ruta (evitando duplicar el punto de unión).

    4. Calcular Offset_Global para L basado en su índice entre sus compañeros de vía.

    5. Dibujar_Ruta_Completa(Puntos_Ruta, Offset_Global):
        - Iniciar Path de Canvas.
        - PARA CADA Punto en Puntos_Ruta:
            - Calcular vector perpendicular a la dirección del movimiento.
            - Desplazar Punto por (Perpendicular * Offset_Global).
            - SI es el primero: MoveTo, SINO: LineTo.
        - Aplicar Color y Stroke.
```

## 4. Ejemplo de Implementación (TypeScript)

```typescript
/**
 * Ejemplo simplificado de cómo se genera una ruta con offset continuo.
 */
function renderPathBasedLine(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  offsetAmount: number,
  color: string,
) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];

    // Calculamos la dirección para el offset
    // Usamos el siguiente punto, o el anterior si es el último
    const next = points[i + 1] || curr;
    const prev = points[i - 1] || curr;

    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    const perpX = -dy / len;
    const perpY = dx / len;

    const tx = curr.x + perpX * offsetAmount;
    const ty = curr.y + perpY * offsetAmount;

    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }

  ctx.stroke();
}
```

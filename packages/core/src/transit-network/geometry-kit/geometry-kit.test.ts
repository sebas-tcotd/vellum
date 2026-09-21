/**
 * El kit es aritmética adimensional compartida por dos consumidores con
 * unidades distintas: el mapa geográfico en metros y la vista esquemática en
 * unidades de viewBox. Sus docblocks afirman que la salida del mapa no cambió
 * «float a float» al pasar por aquí; eso es justo lo que fija un test de
 * caracterización, y hasta ahora el kit sólo se ejercitaba de refilón.
 */
import { describe, expect, it } from 'vitest';
import {
  cubicBezier,
  cutEnd,
  cutStart,
  distanceToPolyline,
  perpCCW,
  perpCW,
  pointAtFraction,
  polylineLength,
  projectOnPolyline,
  roundedRectRing,
  slotOffsetIndex,
  vDot,
  vUnit,
  type Vec2,
} from './index';

const L: Vec2[] = [
  [0, 0],
  [30, 0],
  [30, 40],
];

describe('geometry-kit', () => {
  it('measures a polyline by its pieces', () => {
    expect(polylineLength(L)).toBe(70);
    expect(polylineLength([[5, 5]])).toBe(0);
    expect(polylineLength([])).toBe(0);
  });

  it('centres the slot formula on the bundle, which is the ADR-0004 rule', () => {
    // Un solo carril va en el eje; dos quedan simétricos; tres dejan el de en
    // medio en el eje. Si esto cambia, el mapa y el diagrama se desalinean.
    expect(slotOffsetIndex(0, 1)).toBe(0);
    expect([slotOffsetIndex(0, 2), slotOffsetIndex(1, 2)]).toEqual([-0.5, 0.5]);
    expect([0, 1, 2].map((p) => slotOffsetIndex(p, 3))).toEqual([-1, 0, 1]);
  });

  it('keeps the two perpendiculars exact opposites', () => {
    // La quiralidad es el error fácil de 4.3b: el kit no nombra una «derecha»,
    // ofrece las dos manos y deja que cada frame elija.
    // Ambas normalizan: lo que devuelven es una mano, no una longitud.
    const d: Vec2 = [3, 4];
    expect(perpCW(d)).toEqual([0.8, -0.6]);
    expect(perpCCW(d)).toEqual([-0.8, 0.6]);
    expect(vDot(perpCW(d), d)).toBeCloseTo(0, 12);
    // Opuestas exactas: su producto escalar es −1, que es lo que significa
    // «las dos manos» y lo que hace que elegir la equivocada espeje el dibujo.
    expect(vDot(perpCCW(d), perpCW(d))).toBeCloseTo(-1, 12);
  });

  it('cuts from either end without moving the rest of the path', () => {
    expect(cutStart(L, 10)[0]).toEqual([10, 0]);
    expect(cutEnd(L, 10).at(-1)).toEqual([30, 30]);
    // Cortar más de lo que hay deja una polilínea degenerada, no una excepción.
    expect(polylineLength(cutStart(L, 999))).toBe(0);
    expect(cutStart(L, 0)).toEqual(L);
  });

  it('projects a point onto the nearest piece, not the nearest vertex', () => {
    const hit = projectOnPolyline([15, 9], L);
    expect(hit?.point).toEqual([15, 0]);
    expect(hit?.dist).toBe(9);
    expect(projectOnPolyline([0, 0], [])).toBe(null);
    expect(distanceToPolyline([30, 20], L)).toBe(0);
  });

  it('walks a fraction of the whole length, clamped at both ends', () => {
    expect(pointAtFraction(L, 0)).toEqual([0, 0]);
    expect(pointAtFraction(L, 3 / 7)).toEqual([30, 0]);
    expect(pointAtFraction(L, 1)).toEqual([30, 40]);
    expect(pointAtFraction(L, -1)).toEqual([0, 0]);
    expect(pointAtFraction(L, 2)).toEqual([30, 40]);
  });

  it('closes the station ring and degenerates to a circle', () => {
    const ring = roundedRectRing([0, 0], [1, 0], [0, 1], 5, 5, 4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // Semiejes iguales: el radio de esquina los iguala y el anillo es un círculo,
    // que es la parada de una sola línea.
    for (const [x, y] of ring) {
      expect(Math.hypot(x, y)).toBeCloseTo(5, 6);
    }
  });

  it('samples a Bézier tangent to its control arms at both ends', () => {
    const curve = cubicBezier([0, 0], [10, 0], [20, 10], [20, 20], 8);
    expect(curve).toHaveLength(9);
    expect(curve[0]).toEqual([0, 0]);
    expect(curve.at(-1)).toEqual([20, 20]);
    // La cuerda al primer punto aproxima la tangente: se queda atrás medio paso
    // de muestreo, que es la polilínea, no un error de tangencia.
    const leaving = vUnit([
      curve[1][0] - curve[0][0],
      curve[1][1] - curve[0][1],
    ]);
    // Con 8 muestras la cuerda inicial se queda ~7° por detrás de la tangente
    // exacta; lo que importa es que salga hacia delante por el brazo, no que la
    // polilínea sea infinitamente fina.
    expect(Math.abs(Math.atan2(leaving[1], leaving[0]))).toBeLessThan(0.2);
    // Y nunca se sale de la envolvente de sus puntos de control: es lo que hace
    // que un conector no pueda irse de paseo fuera del área del nudo.
    for (const [x, y] of curve) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(20);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(20);
    }
  });
});

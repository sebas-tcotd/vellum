// Deriva geometría de distritos/parques desde la grilla cruda del Raw Snapshot.
// El bridge captura celdas sin transformar; aquí se interpreta con la misma regla
// que DistrictManager.GetDistrict: cada celda pertenece al ID con mayor alpha.

const ENCODING = 'cell-u8x8-base64';
const LAYOUT = 'id1,id2,id3,id4,alpha1,alpha2,alpha3,alpha4';

export function decodeGrid(grid) {
  if (!grid || grid.encoding !== ENCODING || grid.layout !== LAYOUT)
    throw new Error(`Grilla con encoding/layout no soportado`);
  const bytes = Buffer.from(grid.data, 'base64');
  const cells = grid.resolution * grid.resolution;
  if (bytes.length !== cells * 8)
    throw new Error(
      `Grilla con ${bytes.length} bytes; se esperaban ${cells * 8}`,
    );
  const owner = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) {
    const o = i * 8;
    let best = 0;
    for (let slot = 1; slot < 4; slot++)
      if (bytes[o + 4 + slot] > bytes[o + 4 + best]) best = slot;
    owner[i] = bytes[o + 4 + best] > 0 ? bytes[o + best] : 0;
  }
  return { resolution: grid.resolution, cellSize: grid.cellSize, owner };
}

/** Celda (x, z) que contiene un punto del mundo; la grilla está centrada en el origen. */
export function cellAt(decoded, x, z) {
  const half = decoded.resolution / 2;
  const clamp = (v) =>
    Math.min(decoded.resolution - 1, Math.max(0, Math.floor(v)));
  return [
    clamp(x / decoded.cellSize + half),
    clamp(z / decoded.cellSize + half),
  ];
}

/**
 * Contornos por ID como anillos en coordenadas del mundo [x, z]. Los anillos
 * exteriores son antihorarios (área positiva) y los huecos, horarios.
 */
export function traceAreas(decoded) {
  const { resolution: res, owner } = decoded;
  const at = (x, z) =>
    x < 0 || z < 0 || x >= res || z >= res ? 0 : owner[z * res + x];
  const key = (x, z) => z * (res + 1) + x;
  const edgesById = new Map();
  for (let z = 0; z < res; z++)
    for (let x = 0; x < res; x++) {
      const id = owner[z * res + x];
      if (!id) continue;
      let edges = edgesById.get(id);
      if (!edges) edgesById.set(id, (edges = new Map()));
      // Bordes con el interior a la izquierda: recorrido antihorario de la celda.
      const add = (x0, z0, x1, z1) => {
        const start = key(x0, z0);
        const list = edges.get(start) ?? [];
        list.push({ x0, z0, x1, z1, used: false });
        edges.set(start, list);
      };
      if (at(x, z - 1) !== id) add(x, z, x + 1, z);
      if (at(x + 1, z) !== id) add(x + 1, z, x + 1, z + 1);
      if (at(x, z + 1) !== id) add(x + 1, z + 1, x, z + 1);
      if (at(x - 1, z) !== id) add(x, z + 1, x, z);
    }

  const result = new Map();
  for (const [id, edges] of edgesById) {
    const rings = [];
    for (const list of edges.values())
      for (const first of list) {
        if (first.used) continue;
        const ring = [];
        let edge = first;
        while (edge && !edge.used) {
          edge.used = true;
          ring.push([edge.x0, edge.z0]);
          const dx = edge.x1 - edge.x0;
          const dz = edge.z1 - edge.z0;
          const next = (edges.get(key(edge.x1, edge.z1)) ?? []).filter(
            (e) => !e.used,
          );
          // En un vértice compartido en diagonal se gira a la izquierda para
          // no unir dos celdas que solo se tocan por la esquina.
          const turn = (e) => {
            const ex = e.x1 - e.x0;
            const ez = e.z1 - e.z0;
            if (ex === -dz && ez === dx) return 0;
            if (ex === dx && ez === dz) return 1;
            return 2;
          };
          edge = next.sort((a, b) => turn(a) - turn(b))[0];
        }
        rings.push(simplify(ring).map(([x, z]) => toWorld(decoded, x, z)));
      }
    result.set(id, rings);
  }
  return result;
}

function simplify(ring) {
  const n = ring.length;
  return ring.filter((point, i) => {
    const prev = ring[(i - 1 + n) % n];
    const next = ring[(i + 1) % n];
    const cross =
      (point[0] - prev[0]) * (next[1] - point[1]) -
      (point[1] - prev[1]) * (next[0] - point[0]);
    return cross !== 0;
  });
}

function toWorld(decoded, x, z) {
  const half = decoded.resolution / 2;
  return [(x - half) * decoded.cellSize, (z - half) * decoded.cellSize];
}

export function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    area += x0 * z1 - x1 * z0;
  }
  return area / 2;
}

function insideRing(ring, [x, z]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
}

/** Agrupa anillos en polígonos (exterior + huecos) para GeoJSON MultiPolygon. */
export function toPolygons(rings) {
  const outers = rings.filter((ring) => ringArea(ring) > 0).map((r) => [r]);
  for (const hole of rings.filter((ring) => ringArea(ring) < 0)) {
    // El punto medio de un borde del hueco está dentro de su exterior y no sobre él.
    const probe = [
      (hole[0][0] + hole[1][0]) / 2,
      (hole[0][1] + hole[1][1]) / 2,
    ];
    const owner = outers
      .filter((polygon) => insideRing(polygon[0], probe))
      .sort((a, b) => ringArea(a[0]) - ringArea(b[0]))[0];
    if (owner) owner.push(hole);
  }
  return outers;
}

/**
 * Resumen comparable por área. `labels` son los puntos que exporta `.cslmap`
 * ({ id, name, position: { x, z } }); se verifica si caen dentro del área con el
 * mismo ID. Se compara por ID porque los nombres generados dependen del idioma.
 */
export function summarizeAreas(grid, records, labels = []) {
  const decoded = decodeGrid(grid);
  const traced = traceAreas(decoded);
  const names = new Map((records ?? []).map((r) => [r.id, r.name]));
  const cellArea = decoded.cellSize * decoded.cellSize;
  const counts = new Map();
  for (const id of decoded.owner)
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const areas = [...traced.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, rings]) => {
      const points = rings.flat();
      const xs = points.map((p) => p[0]);
      const zs = points.map((p) => p[1]);
      return {
        id,
        name: names.get(id) ?? null,
        cells: counts.get(id),
        areaKm2: round((counts.get(id) * cellArea) / 1e6),
        polygons: rings.filter((ring) => ringArea(ring) > 0).length,
        holes: rings.filter((ring) => ringArea(ring) < 0).length,
        bbox: [
          Math.min(...xs),
          Math.min(...zs),
          Math.max(...xs),
          Math.max(...zs),
        ].map(round),
      };
    });
  const extent = (decoded.resolution / 2) * decoded.cellSize;
  const outside = (p) => Math.abs(p.x) > extent || Math.abs(p.z) > extent;
  const checks = labels.map((label) => {
    const [x, z] = cellAt(decoded, label.position.x, label.position.z);
    const owner = decoded.owner[z * decoded.resolution + x];
    // cellAt recorta al borde: una etiqueta fuera de la grilla no está en ninguna celda.
    const outsideGrid = outside(label.position);
    return {
      id: Number(label.id),
      name: label.name,
      cellOwner: outsideGrid ? null : owner || null,
      insideSameId: !outsideGrid && owner !== 0 && owner === Number(label.id),
      outsideGrid,
    };
  });
  return {
    gridExtentM: extent,
    areas,
    // Registros sin ninguna celda: el área no existe en esta grilla (p. ej. fuera
    // de los 25 tiles centrales con mods que la expanden por separado).
    withoutCells: (records ?? [])
      .filter((r) => !counts.has(r.id))
      .map((r) => ({ id: r.id, name: r.name })),
    orphanIds: areas.filter((a) => a.name === null).map((a) => a.id),
    labels: checks,
  };
}

/** FeatureCollection en metros del mundo de CS1 (x, z) para inspección visual. */
export function areasGeoJson(kind, grid, records) {
  const traced = traceAreas(decodeGrid(grid));
  const names = new Map((records ?? []).map((r) => [r.id, r.name]));
  return {
    type: 'FeatureCollection',
    features: [...traced.entries()]
      .sort(([a], [b]) => a - b)
      .map(([id, rings]) => ({
        type: 'Feature',
        properties: { kind, id, name: names.get(id) ?? null },
        geometry: {
          type: 'MultiPolygon',
          // GeoJSON exige anillos cerrados (primer punto repetido al final).
          coordinates: toPolygons(rings).map((polygon) =>
            polygon.map((ring) => [...ring, ring[0]]),
          ),
        },
      })),
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

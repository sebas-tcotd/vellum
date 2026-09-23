import { summarizeAreas } from './grid.mjs';

const DOMAINS = {
  roads: ['roadSegments', 'roadNodes'],
  transit: ['transitLines'],
  buildings: ['buildings'],
  districts: ['districts'],
  vegetation: ['forestCells'],
  parks: ['parkAreas'],
  terrain: ['landPolygon', 'contourLines', 'terrainDem'],
  water: ['inlandWaterPolygons', 'coastline'],
};

function profile(value) {
  if (value === undefined) return { present: false, count: null, keys: [] };
  if (value === null) return { present: false, count: null, keys: [] };
  if (Array.isArray(value))
    return {
      present: true,
      count: value.length,
      keys: [
        ...new Set(
          value
            .slice(0, 100)
            .flatMap((item) =>
              item && typeof item === 'object' ? Object.keys(item) : [],
            ),
        ),
      ].sort(),
    };
  return {
    present: true,
    count: null,
    keys: typeof value === 'object' ? Object.keys(value).sort() : [],
  };
}

export function compareCity(raw, baseline, cslmapTerrain = null) {
  const domains = {};
  for (const [domain, baselineFields] of Object.entries(DOMAINS)) {
    const rawProfile = profile(raw.payload[domain]);
    const sourceProfiles = Object.fromEntries(
      baselineFields.map((field) => [field, profile(baseline[field])]),
    );
    const baselinePresent = Object.values(sourceProfiles).some(
      (item) => item.present,
    );
    // La presencia en ambos no demuestra equivalencia semántica.
    const unavailable =
      raw.diagnostics.unsupported?.some(
        (name) => name === domain || name.startsWith(`${domain}:`),
      ) ||
      raw.diagnostics.errors?.some((message) =>
        message.startsWith(`${domain}:`),
      );
    const category = unavailable
      ? 'unresolved'
      : rawProfile.present && baselinePresent
        ? 'unresolved'
        : rawProfile.present
          ? 'raw-only'
          : baselinePresent
            ? 'cslmap-only'
            : 'not-observed';
    domains[domain] = { category, raw: rawProfile, cslmap: sourceProfiles };
  }
  return {
    status: 'comparison-complete',
    cityName: raw.cityName ?? null,
    complete: raw.diagnostics.complete,
    domains,
    transitRoutes: transitRoutes(raw.payload, baseline.transitLines ?? []),
    water: waterComparison(raw.payload, cslmapTerrain),
    terrainLayers: terrainLayers(raw.payload, cslmapTerrain),
    vegetation: vegetationComparison(raw.payload, cslmapTerrain),
    areaGeometry: {
      districts: areaGeometry(
        raw.payload.districtGrid,
        raw.payload.districts,
        baseline.districts,
      ),
      parks: areaGeometry(
        raw.payload.parkGrid,
        raw.payload.parks,
        baseline.parkAreas,
      ),
    },
  };
}

/**
 * `.cslmap` guarda la misma grilla 1081×1081 que `RawHeights` como pares `elev:res` en
 * `<Ter>` y un `<SeaLevel>` escalar. El parser Rust no los expone en `CityData`, así que
 * se leen aquí directamente del XML.
 */
export function parseCslmapTerrain(xml) {
  const ter = /<Ter>([^<]*)<\/Ter>/.exec(xml);
  if (!ter) return null;
  const pairs = ter[1].split(',');
  const elev = new Float64Array(pairs.length);
  const res = new Float64Array(pairs.length);
  pairs.forEach((pair, i) => {
    const [e, r] = pair.split(':');
    elev[i] = Number(e) || 0;
    res[i] = Number(r) || 0;
  });
  const sea = /<SeaLevel>([^<]*)<\/SeaLevel>/.exec(xml);
  // <Forests>: 512 filas <Forest> de densidades 0–255, fila = z (mismo orden que el juego).
  const forest = [...xml.matchAll(/<Forest>([^<]*)<\/Forest>/g)].flatMap(
    (row) => row[1].split(',').map(Number),
  );
  return { seaLevel: sea ? Number(sea[1]) : null, elev, res, forest };
}

function uint16(base64) {
  const bytes = Buffer.from(base64, 'base64');
  const out = new Uint16Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = bytes.readUInt16LE(i * 2);
  return out;
}

/**
 * Pone a prueba celda a celda qué es `res` en `.cslmap` frente a la profundidad cruda
 * (`Cell.m_height`) y las alturas del terreno, y resume las fuentes de agua para
 * contrastar el `SeaLevel` escalar de `.cslmap` con los `target` de las fuentes.
 * Solo cuenta; la interpretación va a findings.md.
 */
export function waterComparison(payload, cslmap) {
  const water = payload.water;
  if (!water) return { error: 'agua ausente en el snapshot' };
  if (!cslmap) return { error: 'grilla <Ter> ausente en el .cslmap' };
  const depth = uint16(water.depth);
  const heights = payload.terrain ? uint16(payload.terrain.data) : null;
  if (depth.length !== cslmap.res.length)
    return {
      error: `grillas distintas: raw ${depth.length}, .cslmap ${cslmap.res.length}`,
    };
  const counts = {
    cells: depth.length,
    rawWet: 0,
    cslmapWet: 0,
    bothWet: 0,
    terrainExact: 0,
    resEqualsDepth: 0,
  };
  const surfaces = new Map();
  for (let i = 0; i < depth.length; i++) {
    const rawWet = depth[i] > 0;
    // res de .cslmap es la profundidad cruda (Cell.m_height), no la superficie.
    if (cslmap.res[i] > 0 && cslmap.res[i] === depth[i])
      counts.resEqualsDepth++;
    // Se compara el dato, no el parser: res es profundidad, así que mojado es res > 0.
    // (El parser comparaba res con SeaLevel en metros; ver PR #105.)
    const cslWet = cslmap.res[i] > 0;
    if (rawWet) counts.rawWet++;
    if (cslWet) counts.cslmapWet++;
    if (rawWet && cslWet) counts.bothWet++;
    if (!heights) continue;
    if (cslmap.elev[i] === heights[i]) counts.terrainExact++;
    if (rawWet) {
      // Cota de la superficie redondeada al metro (64 unidades crudas = 1 m).
      const meters = Math.round((heights[i] + depth[i]) / 64);
      surfaces.set(meters, (surfaces.get(meters) ?? 0) + 1);
    }
  }
  const union = counts.rawWet + counts.cslmapWet - counts.bothWet;
  const sources = water.sources ?? [];
  const byType = {};
  for (const source of sources)
    byType[source.type] = (byType[source.type] ?? 0) + 1;
  return {
    ...counts,
    wetJaccard: union ? Math.round((counts.bothWet / union) * 1000) / 1000 : 1,
    cslmapSeaLevel: cslmap.seaLevel,
    // La cota más frecuente del agua cruda; en mapas con mar coincide con SeaLevel.
    rawSurfaceModeMeters: surfaces.size
      ? [...surfaces].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
      : null,
    sourcesByType: byType,
    // type 1 = natural (mar y ríos del mapa). target en unidades crudas; metros = /64.
    naturalTargetsMeters: [
      ...new Set(
        sources
          .filter((source) => source.type === 1)
          .map((source) => Math.round((source.target / 64) * 1000) / 1000),
      ),
    ].sort((a, b) => a - b),
  };
}

/**
 * Contrasta `<Forest>` de `.cslmap` con la grilla de recursos (`m_forest`, `m_tree`) y con
 * la densidad que el juego deriva de los árboles vivos: +60 por árbol en la celda de
 * 33,75 m, saturando en 255 (TreeAnarchy, `TreesModifiedCoroutine`). Bridge 0.4+.
 */
export function vegetationComparison(payload, cslmap) {
  if (!payload.resourceGrid || !cslmap?.forest?.length) return null;
  const grid = Buffer.from(payload.resourceGrid.data, 'base64');
  const n = payload.resourceGrid.resolution;
  if (n * n !== cslmap.forest.length)
    return {
      error: `grillas distintas: raw ${n * n}, .cslmap ${cslmap.forest.length}`,
    };
  const fromTrees = new Uint16Array(n * n);
  for (const tree of payload.vegetation ?? []) {
    const x = Math.floor(tree.x / 33.75 + n / 2);
    const z = Math.floor(tree.z / 33.75 + n / 2);
    if (x >= 0 && z >= 0 && x < n && z < n) fromTrees[z * n + x] += 60;
  }
  const counts = {
    cells: n * n,
    cslmapForest: 0,
    equalsForest: 0,
    equalsTree: 0,
    equalsTrees: 0,
  };
  for (let i = 0; i < n * n; i++) {
    const value = cslmap.forest[i];
    if (value > 0) counts.cslmapForest++;
    if (value === grid[i * 2]) counts.equalsForest++;
    if (value === grid[i * 2 + 1]) counts.equalsTree++;
    if (value === Math.min(fromTrees[i], 255)) counts.equalsTrees++;
  }
  return {
    ...counts,
    trees: payload.vegetation?.length ?? 0,
    treeBufferLength: payload.treeBufferLength ?? null,
  };
}

/**
 * Para las celdas donde `<Ter>` difiere de `RawHeights`, cuenta cuántas explica cada
 * capa alternativa de `TerrainManager` (capturadas de forma dispersa por Bridge 0.3).
 */
export function terrainLayers(payload, cslmap) {
  if (!payload.terrainLayers || !payload.terrain || !cslmap) return null;
  const heights = uint16(payload.terrain.data);
  const mismatched = [];
  for (let i = 0; i < heights.length; i++)
    if (cslmap.elev[i] !== heights[i]) mismatched.push(i);
  return {
    mismatched: mismatched.length,
    layers: payload.terrainLayers.map((layer) => {
      const values = new Map(
        layer.indices.map((index, k) => [index, layer.values[k]]),
      );
      return {
        name: layer.name,
        differsFromRaw: layer.indices.length,
        explainsMismatch: mismatched.filter(
          (i) => (values.get(i) ?? heights[i]) === cslmap.elev[i],
        ).length,
      };
    }),
  };
}

/**
 * Contrasta el camino crudo del pathfinder (posiciones de PathUnit por tramo) con la
 * secuencia de segmentos que exporta `.cslmap`, y mide cuántas paradas quedan sobre
 * una calle con nombre (base para nombrarlas, ya que CS1 no tiene nombres de parada).
 */
export function transitRoutes(payload, baselineLines) {
  if (!Array.isArray(payload.transit)) return { error: 'tránsito ausente' };
  const roadNames = new Map(
    (payload.roads ?? []).map((road) => [road.id, road.name]),
  );
  const baseline = new Map(
    baselineLines.map((line) => [Number(line.id), line]),
  );
  return payload.transit.map((line) => {
    const stops = line.stopNodeIds?.length ?? 0;
    const onNamedRoad = (line.stopRoadSegments ?? []).filter((id) =>
      roadNames.get(id),
    ).length;
    const base = baseline.get(line.id);
    const summary = {
      id: line.id,
      name: line.name ?? line.customName ?? null,
      stops,
      stopsOnNamedRoad: line.stopRoadSegments ? onNamedRoad : null,
      inCslmap: Boolean(base),
      cslmapName: base?.name ?? null,
      sameName: base ? (line.name ?? null) === base.name : null,
      sameColor: base
        ? // .cslmap exporta #RRGGBBAA; raw, #rrggbb.
          // displayColor (Bridge 0.5+) es el color visible; color, el m_color crudo.
          (line.displayColor ?? line.color ?? '').toLowerCase() ===
          (base.color ?? '').toLowerCase().slice(0, 7)
        : null,
    };
    if (!Array.isArray(line.legs))
      return { ...summary, error: 'tramos no capturados' };
    const raw = line.legs.flatMap((leg) => leg.pathSegments);
    const exported = base
      ? base.route.flatMap((part) => part.segmentIds.map(Number))
      : null;
    return {
      ...summary,
      legs: line.legs.length,
      legsWithoutPath: line.legs.filter(
        (leg) => !leg.pathReady || leg.pathSegments.length === 0,
      ).length,
      rawPositions: raw.length,
      cslmapPositions: exported?.length ?? null,
      sameSequence: exported
        ? exported.length === raw.length &&
          exported.every((id, i) => id === raw[i])
        : null,
      // En capturas simultáneas, .cslmap resulta ser el camino crudo sin la posición
      // repetida de cada tramo: la secuencia difiere, pero sigue el mismo recorrido.
      cslmapIsSubsequence: exported ? isSubsequence(exported, raw) : null,
      segmentOverlap: exported ? jaccard(raw, exported) : null,
      // Segmentos de la ruta exportada que no existen en la ciudad capturada.
      cslmapMissingSegments: exported
        ? [...new Set(exported)].filter((id) => !roadNames.has(id)).length
        : null,
    };
  });
}

function isSubsequence(needle, haystack) {
  let j = 0;
  for (const id of haystack) if (j < needle.length && id === needle[j]) j++;
  return j === needle.length;
}

function yesNo(value) {
  return value === null || value === undefined ? '—' : value ? 'sí' : 'no';
}

function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  const union = new Set([...left, ...right]).size;
  if (union === 0) return 1;
  const shared = [...left].filter((id) => right.has(id)).length;
  return Math.round((shared / union) * 1000) / 1000;
}

// `.cslmap` solo exporta un punto de etiqueta por área; la grilla cruda permite
// derivar su extensión. Un fallo aquí no invalida el resto de la comparación.
function areaGeometry(grid, records, labels) {
  if (!grid) return { error: 'grilla ausente en el snapshot' };
  try {
    return summarizeAreas(grid, records, labels ?? []);
  } catch (error) {
    return { error: String(error) };
  }
}

export function reportMarkdown(report) {
  const lines = [
    '# Comparación Vellum Bridge / CSLMap',
    '',
    `Corpus: ${report.entries.length} entradas`,
    `Pares comparados: ${report.summary.comparado}`,
    `Capturas pendientes: ${report.summary.pendientes}`,
    `No comparables: ${report.summary.noComparables}`,
    '',
    '| Ciudad | Estado | Raw | CSLMap |',
    '|---|---|---|---|',
  ];
  for (const item of report.entries)
    lines.push(
      `| ${item.id} | ${item.status} | ${item.snapshot ?? 'pendiente'} | ${item.cslmap} |`,
    );
  lines.push(
    '',
    'Las categorías estructurales no implican equivalencia semántica. `unresolved` requiere revisión humana.',
    '',
  );
  if (report.corpus) lines.push(...corpusMarkdown(report.corpus));
  for (const item of report.entries.filter((entry) => entry.comparison)) {
    lines.push(
      `## ${item.id}`,
      '',
      `Captura: ${item.comparison.complete ? 'completa' : 'parcial'}`,
      `Dominios no soportados: ${item.diagnostics?.unsupported?.join(', ') || 'ninguno'}`,
      '',
      '| Dominio | Categoría | Conteo raw |',
      '|---|---|---:|',
    );
    for (const [domain, result] of Object.entries(item.comparison.domains))
      lines.push(
        `| ${domain} | ${result.category} | ${result.raw.count ?? '—'} |`,
      );
    lines.push('');
    const water = item.comparison.water;
    if (water) {
      lines.push('### Agua', '');
      if (water.error) lines.push(`Error: ${water.error}`, '');
      else
        lines.push(
          '| Celdas | Mojadas raw | Mojadas .cslmap | Ambas | Jaccard | Terreno idéntico | res = profundidad | Cota modal raw (m) | SeaLevel .cslmap | Targets naturales (m) | Fuentes por tipo |',
          '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|',
          `| ${water.cells} | ${water.rawWet} | ${water.cslmapWet} | ${water.bothWet} | ${water.wetJaccard} | ${water.terrainExact} | ${water.resEqualsDepth} | ${water.rawSurfaceModeMeters ?? '—'} | ${water.cslmapSeaLevel ?? '—'} | ${water.naturalTargetsMeters.join(', ') || '—'} | ${
            Object.entries(water.sourcesByType)
              .map(([t, n]) => `${t}: ${n}`)
              .join(', ') || '—'
          } |`,
          '',
        );
    }
    const vegetation = item.comparison.vegetation;
    if (vegetation) {
      lines.push('### Vegetación', '');
      if (vegetation.error) lines.push(`Error: ${vegetation.error}`, '');
      else
        lines.push(
          '| Celdas | Con bosque en .cslmap | = m_forest | = m_tree | = densidad de árboles raw | Árboles | Buffer de árboles |',
          '|---:|---:|---:|---:|---:|---:|---:|',
          `| ${vegetation.cells} | ${vegetation.cslmapForest} | ${vegetation.equalsForest} | ${vegetation.equalsTree} | ${vegetation.equalsTrees} | ${vegetation.trees} | ${vegetation.treeBufferLength ?? '—'} |`,
          '',
        );
    }
    const layers = item.comparison.terrainLayers;
    if (layers) {
      lines.push(
        '### Capas de alturas',
        '',
        `Celdas donde <Ter> difiere de RawHeights: ${layers.mismatched}`,
        '',
        '| Capa | Celdas distintas de RawHeights | Diferencias de <Ter> que explica |',
        '|---|---:|---:|',
        ...layers.layers.map(
          (l) => `| ${l.name} | ${l.differsFromRaw} | ${l.explainsMismatch} |`,
        ),
        '',
      );
    }
    const routes = item.comparison.transitRoutes;
    lines.push('### Rutas de tránsito', '');
    if (!Array.isArray(routes)) lines.push(`Error: ${routes?.error}`, '');
    else {
      lines.push(
        '| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |',
        '|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|',
      );
      for (const r of routes)
        lines.push(
          r.error
            ? `| ${r.id} | ${r.name ?? '—'} | ${r.stops} | ${r.stopsOnNamedRoad ?? '—'} | — | — | — | — | ${r.error} | — | — | — |`
            : `| ${r.id} | ${r.name ?? '—'} | ${r.stops} | ${r.stopsOnNamedRoad ?? '—'} | ${r.legs} | ${r.legsWithoutPath} | ${r.rawPositions} | ${r.cslmapPositions ?? '—'} | ${yesNo(r.sameSequence)} | ${yesNo(r.cslmapIsSubsequence)} | ${r.segmentOverlap ?? '—'} | ${r.cslmapMissingSegments ?? '—'} |`,
        );
      lines.push('');
    }
    for (const [kind, geometry] of Object.entries(
      item.comparison.areaGeometry ?? {},
    )) {
      lines.push(`### Geometría de ${kind}`, '');
      if (geometry.error) {
        lines.push(`Error: ${geometry.error}`, '');
        continue;
      }
      lines.push(
        '| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |',
        '|---:|---|---:|---:|---:|---:|---|',
      );
      const labels = new Map(geometry.labels.map((l) => [l.id, l]));
      for (const area of geometry.areas)
        lines.push(
          `| ${area.id} | ${area.name ?? '—'} | ${area.cells} | ${area.areaKm2} | ${area.polygons} | ${area.holes} | ${labels.has(area.id) ? (labels.get(area.id).insideSameId ? 'sí' : 'no') : '—'} |`,
        );
      for (const missing of geometry.withoutCells) {
        const label = labels.get(missing.id);
        lines.push(
          `| ${missing.id} | ${missing.name ?? '—'} | 0 | 0 | 0 | 0 | ${label?.outsideGrid ? 'fuera de la grilla' : 'no'} |`,
        );
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

/**
 * Evidencia agregada del corpus por dominio. Solo cuenta; las conclusiones y su nivel
 * de confianza se escriben a mano en el documento de hallazgos.
 */
export function corpusSummary(entries) {
  const compared = entries.filter((entry) => entry.comparison);
  const domains = {};
  for (const domain of Object.keys(DOMAINS)) {
    const counts = compared
      .map((entry) => entry.comparison.domains[domain].raw.count)
      .filter((count) => count !== null);
    domains[domain] = {
      raw: compared
        .filter((entry) => entry.comparison.domains[domain].raw.present)
        .map((entry) => entry.id),
      cslmap: compared
        .filter((entry) =>
          Object.values(entry.comparison.domains[domain].cslmap).some(
            (item) => item.present,
          ),
        )
        .map((entry) => entry.id),
      rawCount: counts.length
        ? [Math.min(...counts), Math.max(...counts)]
        : null,
    };
  }
  // Las líneas sin paradas coinciden trivialmente; no aportan evidencia de ruta.
  const lines = compared.flatMap((entry) =>
    Array.isArray(entry.comparison.transitRoutes)
      ? entry.comparison.transitRoutes
          .filter((line) => line.stops > 0)
          .map((line) => ({ ...line, fixture: entry.id }))
      : [],
  );
  const routed = lines.filter((line) => !line.error);
  const sum = (key) =>
    lines.reduce((total, line) => total + (line[key] ?? 0), 0);
  const areaLabels = (kind) =>
    compared.flatMap(
      (entry) => entry.comparison.areaGeometry?.[kind]?.labels ?? [],
    );
  const unsupported = {};
  for (const entry of compared)
    for (const name of [
      ...(entry.diagnostics?.unsupported ?? []),
      ...(entry.diagnostics?.errors ?? []).map((m) => m.split(':')[0]),
    ])
      (unsupported[name] ??= []).push(entry.id);
  return {
    fixtures: compared.map((entry) => entry.id),
    partialCaptures: compared.filter((entry) => !entry.comparison.complete)
      .length,
    domains,
    transit: {
      lines: lines.length,
      inCslmap: lines.filter((line) => line.inCslmap).length,
      cslmapIsSubsequence: routed.filter((line) => line.cslmapIsSubsequence)
        .length,
      notSubsequence: routed
        .filter((line) => line.inCslmap && !line.cslmapIsSubsequence)
        .map((line) => `${line.fixture}#${line.id}`),
      // Líneas cuyos tramos no se capturaron: sin evidencia de ruta.
      withoutLegs: lines.length - routed.length,
      legsWithoutPath: sum('legsWithoutPath'),
      stops: sum('stops'),
      stopsOnNamedRoad: sum('stopsOnNamedRoad'),
      sameName: lines.filter((line) => line.sameName).length,
      differentName: lines
        .filter((line) => line.sameName === false)
        .map((line) => `${line.fixture}#${line.id}`),
      sameColor: lines.filter((line) => line.sameColor).length,
    },
    areas: Object.fromEntries(
      ['districts', 'parks'].map((kind) => {
        const labels = areaLabels(kind);
        return [
          kind,
          {
            labels: labels.length,
            insideSameId: labels.filter((label) => label.insideSameId).length,
          },
        ];
      }),
    ),
    unsupported,
  };
}

function corpusMarkdown(corpus) {
  const t = corpus.transit;
  const pct = (part, whole) =>
    whole ? `${Math.round((part / whole) * 100)} %` : '—';
  const lines = [
    '## Resumen del corpus',
    '',
    `Pares: ${corpus.fixtures.length} (${corpus.partialCaptures} capturas parciales)`,
    '',
    '| Dominio | Ciudades con raw | Ciudades con .cslmap | Conteo raw (mín–máx) |',
    '|---|---:|---:|---|',
  ];
  for (const [domain, d] of Object.entries(corpus.domains))
    lines.push(
      `| ${domain} | ${d.raw.length} | ${d.cslmap.length} | ${d.rawCount ? d.rawCount.join('–') : '—'} |`,
    );
  lines.push(
    '',
    `Tránsito (líneas con paradas): ${t.lines} líneas, ${t.inCslmap} en .cslmap, ${t.cslmapIsSubsequence} con la ruta .cslmap contenida en el camino crudo${t.notSubsequence.length ? ` (excepciones: ${t.notSubsequence.join(', ')})` : ''}; ${t.legsWithoutPath} tramos sin camino${t.withoutLegs ? `; ${t.withoutLegs} líneas sin tramos capturados` : ''}.`,
    `Paradas sobre calle con nombre: ${t.stopsOnNamedRoad} de ${t.stops} (${pct(t.stopsOnNamedRoad, t.stops)}).`,
    `Nombre de línea igual en .cslmap (GetLineName): ${t.sameName} de ${t.inCslmap}${t.differentName.length ? ` (distintos: ${t.differentName.join(', ')})` : ''}; color igual: ${t.sameColor}.`,
  );
  for (const [kind, a] of Object.entries(corpus.areas))
    lines.push(
      `Etiquetas .cslmap de ${kind} dentro de su área raw: ${a.insideSameId} de ${a.labels}.`,
    );
  lines.push('', '| No soportado / error | Ciudades |', '|---|---:|');
  for (const [name, ids] of Object.entries(corpus.unsupported))
    lines.push(`| ${name} | ${ids.length} |`);
  lines.push('');
  return lines;
}

export function summarize(entries) {
  return {
    comparado: entries.filter((entry) => entry.status === 'comparison-complete')
      .length,
    pendientes: entries.filter((entry) => entry.status === 'ready-for-capture')
      .length,
    noComparables: entries.filter(
      (entry) =>
        entry.status === 'not-comparable' || entry.status === 'capture-failed',
    ).length,
    excluidos: entries.filter((entry) => entry.status === 'excluded-synthetic')
      .length,
  };
}

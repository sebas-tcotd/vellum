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

export function compareCity(raw, baseline) {
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

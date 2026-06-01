import { GRID_SIZE } from './PresenceGrid';

// Vertex space is (GRID_SIZE+1) × (GRID_SIZE+1) — corners of the tile grid.
// Vertex (col, row) is the top-left corner of tile (row, col).
const V = GRID_SIZE + 1; // 1082

function vertIdx(col: number, row: number): number {
  return row * V + col;
}

function isWater(grid: Uint8Array, r: number, c: number): boolean {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
  return grid[r * GRID_SIZE + c] === 1;
}

// Returns an array of closed polygons. Each polygon is a flat Float32Array of
// [col0, row0, col1, row1, ...] in tile-vertex space (integers 0..GRID_SIZE).
// X-axis: col 0 = east edge of map, col GRID_SIZE = west edge.
// Y-axis: row 0 = north edge of map, row GRID_SIZE = south edge.
// Every directed edge is oriented so that the water cell is to its LEFT —
// this produces counterclockwise outer boundaries and clockwise hole boundaries,
// which renders correctly with the canvas 'evenodd' fill rule.
export function traceWaterContours(grid: Uint8Array): Float32Array[] {
  const N = GRID_SIZE;

  // Collect directed boundary edges as adjacency lists indexed by source vertex.
  const nextEdges = new Map<number, number[]>();

  function addEdge(c1: number, r1: number, c2: number, r2: number): void {
    const from = vertIdx(c1, r1);
    let nexts = nextEdges.get(from);
    if (!nexts) {
      nexts = [];
      nextEdges.set(from, nexts);
    }
    nexts.push(vertIdx(c2, r2));
  }

  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      if (!isWater(grid, row, col)) continue;

      // For each exposed side, add a directed edge that keeps the water cell to the LEFT.
      if (!isWater(grid, row - 1, col)) addEdge(col, row, col + 1, row);
      if (!isWater(grid, row, col + 1)) addEdge(col + 1, row, col + 1, row + 1);
      if (!isWater(grid, row + 1, col)) addEdge(col + 1, row + 1, col, row + 1);
      if (!isWater(grid, row, col - 1)) addEdge(col, row + 1, col, row);
    }
  }

  // Walk the edge graph, consuming edges until all boundary chains are traced.
  const polygons: Float32Array[] = [];

  for (const [startVert, nexts] of nextEdges) {
    while (nexts.length > 0) {
      const startCol = startVert % V;
      const startRow = Math.floor(startVert / V);

      const vertices: number[] = [startCol, startRow];

      // Consume the first outgoing edge from startVert.
      let curVert = nexts.pop()!;
      if (nexts.length === 0) nextEdges.delete(startVert);

      // Follow the chain until we return to startVert.
      while (curVert !== startVert) {
        const curCol = curVert % V;
        const curRow = Math.floor(curVert / V);
        vertices.push(curCol, curRow);

        const curNexts = nextEdges.get(curVert);
        if (!curNexts || curNexts.length === 0) break;

        const next = curNexts.pop()!;
        if (curNexts.length === 0) nextEdges.delete(curVert);
        curVert = next;
      }

      // Minimum 3 vertices (6 floats) to form a valid polygon.
      if (vertices.length >= 6) {
        polygons.push(new Float32Array(vertices));
      }
    }
  }

  return polygons;
}

// Applies one pass of Chaikin subdivision: replaces each edge AB with two new
// vertices at 1/4 and 3/4 of AB, effectively rounding all corners.
function chaikin(vertices: number[]): number[] {
  const n = vertices.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = vertices[i * 2],
      ay = vertices[i * 2 + 1];
    const bx = vertices[j * 2],
      by = vertices[j * 2 + 1];
    out.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by);
    out.push(0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by);
  }
  return out;
}

// Converts tile-vertex-space polygons into a single Path2D in canvas-pixel space.
// The X axis is mirrored: col 0 (east) maps to the right side of the canvas.
// Uses evenodd fill rule so holes (enclosed non-water areas) render correctly.
// Corners are smoothed via midpoint quadratic curves (Chaikin-style): each vertex
// becomes a quadratic control point, and each edge midpoint becomes an anchor.
// This converts the staircase-shaped tile boundaries into organic coastline curves.
export function buildWaterPath(
  polygons: Float32Array[],
  canvasSize: number,
): Path2D {
  const scale = canvasSize / GRID_SIZE;
  const path = new Path2D();

  for (const rawPolygon of polygons) {
    if (rawPolygon.length < 6) continue;

    // Two Chaikin passes before building the path: each pass doubles the vertex
    // count and rounds corners progressively. Two passes give a smooth B-spline
    // approximation of the original staircase boundary.
    let smoothed = chaikin(Array.from(rawPolygon));
    smoothed = chaikin(smoothed);

    const polygon = smoothed;
    const n = polygon.length / 2;

    // West (col=0) → left (px=0), East (col=GRID_SIZE) → right (px=canvasSize)
    // North (row=GRID_SIZE) → top (py=0), South (row=0) → bottom (py=canvasSize)
    const px = (i: number): number => polygon[i * 2] * scale;
    const py = (i: number): number => (GRID_SIZE - polygon[i * 2 + 1]) * scale;

    // Start at the midpoint of the last→first edge so the path closes smoothly.
    const startX = (px(n - 1) + px(0)) / 2;
    const startY = (py(n - 1) + py(0)) / 2;
    path.moveTo(startX, startY);

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const midX = (px(i) + px(next)) / 2;
      const midY = (py(i) + py(next)) / 2;
      // Vertex i is the quadratic control point; midpoint to next is the anchor.
      path.quadraticCurveTo(px(i), py(i), midX, midY);
    }

    path.closePath();
  }

  return path;
}

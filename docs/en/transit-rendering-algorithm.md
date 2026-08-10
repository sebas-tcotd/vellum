# Transit rendering algorithm: path-based rendering

Transit data is naturally described as a sequence of segments, but drawing every
segment independently produces a poor map. A line can switch sides of a road,
leave gaps at nodes or become visually unstable when several lines share the same
corridor. Vellum treats a transit line as a continuous path before it applies the
visual offset.

## In simple terms: the ribbon analogy

Segment-by-segment rendering is like painting disconnected strips of road without
remembering how the previous strip ended. Path-based rendering first joins the
strips into one long ribbon, makes its direction consistent, and then draws that
ribbon in one pass. The result is continuous geometry and a stable lane position.

## Technical model

### Directional consistency

Segments in `.cslmap` retain the direction in which they were created in the game.
That direction is not guaranteed to match the order in which a transit route
traverses them. While walking the route, Vellum checks whether the next segment's
start node matches the current node. If it does not, the segment's points are
reversed before they are appended to the path.

### Node continuity

The route is drawn as one path rather than one stroke per segment. Rounded joins
then handle intersections consistently, reducing visible gaps and overlaps.

### Lane stability

Each line receives an offset based on its order among the lines sharing a corridor:

- With an odd number of lines, one line occupies the center and the others are
  distributed symmetrically.
- With an even number, no line occupies the exact center; the lanes mirror around
  the center axis.

The offset is a property of the route, not a fresh decision made independently at
every segment.

### Edge cases

A route can move from a corridor with many lines to one with fewer lines. A future
improvement could ease that change with an offset ramp instead of a sudden jump.
Complex intersections may also need a direction average at corners to avoid
sharp lateral spikes.

## Pseudocode

```text
FOR EACH transit line L:
    routePoints = position of the first stop
    currentNode = first route node

    FOR EACH segment in L:
        worldPoints = [start, curve points..., end]

        IF segment.start != currentNode:
            reverse(worldPoints)
            currentNode = segment.start
        ELSE:
            currentNode = segment.end

        append worldPoints, skipping the duplicate join point

    offset = lane offset for L among its corridor peers
    draw the complete route with that offset
```

## Implementation note

The following simplified example shows the geometry idea. Production rendering
also has to handle zero-length points, map projection and the renderer's own
coordinate conventions.

```typescript
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

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[i + 1] ?? current;
    const previous = points[i - 1] ?? current;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) continue;

    const perpendicularX = -dy / length;
    const perpendicularY = dx / length;
    const x = current.x + perpendicularX * offsetAmount;
    const y = current.y + perpendicularY * offsetAmount;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.stroke();
}
```

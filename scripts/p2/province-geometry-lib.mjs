/**
 * Shared province geometry helpers for the P2 repair scripts (D-128).
 *
 * Bundle rings are delta-encoded integer millidegrees; polygon-clipping works in
 * degrees with closed rings. `holes` lists the ring indices that are holes.
 */

export function decodeRing(flat) {
  const points = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < flat.length; index += 2) {
    x += flat[index];
    y += flat[index + 1];
    points.push([x, y]);
  }
  return points;
}

export function encodeRing(points) {
  const flat = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of points) {
    flat.push(x - px, y - py);
    px = x;
    py = y;
  }
  return flat;
}

/** Province rings (integer millidegrees) -> polygon-clipping MultiPolygon in degrees. */
export function toMultiPolygon(province) {
  const holes = new Set(province.holes);
  const polygons = [];
  province.rings.forEach((ring, index) => {
    const points = decodeRing(ring).map(([x, y]) => [x / 1000, y / 1000]);
    if (points.length < 3) return;
    const closed = [...points, points[0]];
    if (holes.has(index)) {
      // A hole belongs to the outer ring that contains its first point.
      const host = polygons.find((polygon) => pointInRing(points[0], polygon[0]));
      if (host !== undefined) host.push(closed);
    } else {
      polygons.push([closed]);
    }
  });
  return polygons;
}

/** MultiPolygon in degrees -> rings/holes in the bundle encoding. */
export function fromMultiPolygon(multi) {
  const rings = [];
  const holes = [];
  for (const polygon of multi) {
    polygon.forEach((ring, ringIndex) => {
      const points = [];
      for (const [x, y] of ring.slice(0, -1)) {
        const qx = Math.round(x * 1000);
        const qy = Math.round(y * 1000);
        const last = points[points.length - 1];
        if (last === undefined || last[0] !== qx || last[1] !== qy) points.push([qx, qy]);
      }
      if (points.length < 3) return;
      if (ringIndex > 0) {
        // Consumers assign a hole to the outer ring containing its first vertex, so the
        // hole must not start on a vertex it shares with that outer ring.
        const outer = new Set(polygon[0].map(([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`));
        const start = points.findIndex(([x, y]) => !outer.has(`${x},${y}`));
        if (start > 0) points.push(...points.splice(0, start));
        holes.push(rings.length);
      }
      rings.push(encodeRing(points));
    });
  }
  return { rings, holes };
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum) / 2;
}

export function multiArea(multi) {
  let area = 0;
  for (const polygon of multi) {
    area += ringArea(polygon[0]);
    for (const hole of polygon.slice(1)) area -= ringArea(hole);
  }
  return area;
}

export function inMulti(point, multi) {
  return multi.some(
    (polygon) => pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole)),
  );
}

export function refresh(province, multi) {
  const { rings, holes } = fromMultiPolygon(multi);
  province.rings = rings;
  province.holes = holes;
  province.area = Number(multiArea(multi).toFixed(3));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of multi) {
    for (const [x, y] of polygon[0]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  province.bbox = [minX, minY, maxX, maxY].map((value) => Number(value.toFixed(3)));
  if (!inMulti(province.label, multi)) {
    // Centroid of the largest outer ring, or a vertex midpoint if that falls outside.
    const largest = [...multi].sort((a, b) => ringArea(b[0]) - ringArea(a[0]))[0][0];
    let cx = 0;
    let cy = 0;
    for (const [x, y] of largest) {
      cx += x;
      cy += y;
    }
    let label = [cx / largest.length, cy / largest.length];
    if (!inMulti(label, multi)) label = largest[0];
    province.label = label.map((value) => Number(value.toFixed(3)));
  }
}


export function bboxOf(multi) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of multi) {
    for (const [x, y] of polygon[0]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

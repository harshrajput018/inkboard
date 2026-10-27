import type { Box, Handle, Shape } from "./types";

export function normalize(x: number, y: number, w: number, h: number): Box {
  return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
}

export function boxFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return normalize(a.x, a.y, b.x - a.x, b.y - a.y);
}

export function boundsOf(s: Shape): Box {
  return normalize(s.x, s.y, s.w, s.h);
}

export function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function intersects(a: Box, b: Box) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export function contains(outer: Box, inner: Box) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitTest(s: Shape, px: number, py: number, tol: number): boolean {
  const pad = tol + s.strokeWidth / 2;
  switch (s.type) {
    case "line":
    case "arrow":
      return distToSegment(px, py, s.x, s.y, s.x + s.w, s.y + s.h) <= pad;
    case "pen": {
      const pts = s.points ?? [];
      if (pts.length === 1) return Math.hypot(px - s.x - pts[0][0], py - s.y - pts[0][1]) <= pad + s.strokeWidth;
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(px, py, s.x + pts[i - 1][0], s.y + pts[i - 1][1], s.x + pts[i][0], s.y + pts[i][1]) <= pad + s.strokeWidth) return true;
      }
      return false;
    }
    case "ellipse": {
      const b = boundsOf(s);
      const rx = b.w / 2 + pad;
      const ry = b.h / 2 + pad;
      return ((px - b.x - b.w / 2) / rx) ** 2 + ((py - b.y - b.h / 2) / ry) ** 2 <= 1;
    }
    case "diamond": {
      const b = boundsOf(s);
      return Math.abs(px - b.x - b.w / 2) / (b.w / 2 + pad) + Math.abs(py - b.y - b.h / 2) / (b.h / 2 + pad) <= 1;
    }
    default: {
      const b = boundsOf(s);
      return px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad;
    }
  }
}

/** Topmost shape under the point. `shapes` must be sorted bottom → top. */
export function topHit(shapes: Shape[], px: number, py: number, tol: number): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) if (hitTest(shapes[i], px, py, tol)) return shapes[i];
  return null;
}

export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function handlePoint(b: Box, h: Handle) {
  const x = h.includes("w") ? b.x : h.includes("e") ? b.x + b.w : b.x + b.w / 2;
  const y = h.includes("n") ? b.y : h.includes("s") ? b.y + b.h : b.y + b.h / 2;
  return { x, y };
}

export function handleAt(b: Box, px: number, py: number, radius: number): Handle | null {
  for (const h of HANDLES) {
    const p = handlePoint(b, h);
    if (Math.abs(px - p.x) <= radius && Math.abs(py - p.y) <= radius) return h;
  }
  return null;
}

/** Drags one handle of a box by (dx, dy). The result may be flipped; it is always normalised. */
export function resizeBox(b: Box, h: Handle, dx: number, dy: number, keepRatio = false): Box {
  let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
  if (h.includes("w")) x1 += dx;
  if (h.includes("e")) x2 += dx;
  if (h.includes("n")) y1 += dy;
  if (h.includes("s")) y2 += dy;
  if (keepRatio && h.length === 2 && b.w && b.h) {
    const ratio = b.w / b.h;
    const w = x2 - x1;
    const hgt = y2 - y1;
    if (Math.abs(w) / ratio > Math.abs(hgt)) {
      const nh = (Math.abs(w) / ratio) * Math.sign(hgt || 1);
      if (h.includes("n")) y1 = y2 - nh;
      else y2 = y1 + nh;
    } else {
      const nw = Math.abs(hgt) * ratio * Math.sign(w || 1);
      if (h.includes("w")) x1 = x2 - nw;
      else x2 = x1 + nw;
    }
  }
  return normalize(x1, y1, x2 - x1, y2 - y1);
}

/** Maps a shape from one bounding box into another — used for single and group resizing. */
export function transformShape(s: Shape, from: Box, to: Box): Shape {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const mx = (x: number) => to.x + (x - from.x) * sx;
  const my = (y: number) => to.y + (y - from.y) * sy;

  switch (s.type) {
    case "line":
    case "arrow": {
      const x = mx(s.x);
      const y = my(s.y);
      return { ...s, x, y, w: mx(s.x + s.w) - x, h: my(s.y + s.h) - y };
    }
    case "pen":
      return { ...s, x: mx(s.x), y: my(s.y), w: s.w * sx, h: s.h * sy, points: s.points?.map(([px, py, p]) => [px * sx, py * sy, p]) };
    case "text": {
      const b = boundsOf(s);
      return { ...s, x: mx(b.x), y: my(b.y), w: b.w * sx, h: b.h * sy, fontSize: Math.max(8, (s.fontSize ?? 24) * sy) };
    }
    default: {
      const b = boundsOf(s);
      return { ...s, ...normalize(mx(b.x), my(b.y), b.w * sx, b.h * sy) };
    }
  }
}

/** Re-bases pen points so (x, y) is the top-left of the stroke and w/h are its size. */
export function normalizePen(s: Shape): Shape {
  const pts = s.points ?? [];
  if (!pts.length) return s;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { ...s, x: s.x + minX, y: s.y + minY, w: maxX - minX, h: maxY - minY, points: pts.map(([x, y, p]) => [x - minX, y - minY, p]) };
}

/** Snaps a vector to the nearest 15° while keeping its length. */
export function snapAngle(dx: number, dy: number) {
  const len = Math.hypot(dx, dy);
  const step = Math.PI / 12;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { dx: Math.cos(a) * len, dy: Math.sin(a) * len };
}

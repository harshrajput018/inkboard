import { describe, expect, it } from "vitest";
import { boundsOf, handleAt, hitTest, normalizePen, resizeBox, snapAngle, topHit, transformShape, union } from "./geometry";
import type { Shape } from "./types";

const s = (over: Partial<Shape>): Shape => ({ id: "x", type: "rect", x: 0, y: 0, w: 100, h: 50, z: 0, stroke: "ink", fill: "none", strokeWidth: 2, ...over });

describe("geometry", () => {
  it("normalises shapes drawn right-to-left", () => {
    expect(boundsOf(s({ x: 100, y: 50, w: -100, h: -50 }))).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it("hit-tests ellipses by shape, not by bounding box", () => {
    const e = s({ type: "ellipse" });
    expect(hitTest(e, 50, 25, 0)).toBe(true);
    expect(hitTest(e, 2, 2, 0)).toBe(false); // corner of the box is outside the ellipse
  });

  it("hit-tests lines by distance to the segment", () => {
    const l = s({ type: "line", w: 100, h: 0 });
    expect(hitTest(l, 50, 3, 3)).toBe(true);
    expect(hitTest(l, 50, 20, 3)).toBe(false);
  });

  it("returns the topmost shape", () => {
    const shapes = [s({ id: "below" }), s({ id: "above", x: 50 })];
    expect(topHit(shapes, 75, 25, 0)?.id).toBe("above");
    expect(topHit(shapes, 10, 25, 0)?.id).toBe("below");
  });

  it("resizes from a corner and flips past the opposite edge", () => {
    const b = { x: 0, y: 0, w: 100, h: 50 };
    expect(resizeBox(b, "se", 20, 10)).toEqual({ x: 0, y: 0, w: 120, h: 60 });
    expect(resizeBox(b, "e", -150, 0)).toEqual({ x: -50, y: 0, w: 50, h: 50 });
  });

  it("keeps aspect ratio when asked", () => {
    const r = resizeBox({ x: 0, y: 0, w: 100, h: 50 }, "se", 100, 0, true);
    expect(r.w / r.h).toBeCloseTo(2);
  });

  it("maps a group of shapes into a new box", () => {
    const from = union([boundsOf(s({})), boundsOf(s({ x: 100 }))])!;
    const to = { x: 0, y: 0, w: from.w * 2, h: from.h * 2 };
    const moved = transformShape(s({ x: 100 }), from, to);
    expect(boundsOf(moved)).toEqual({ x: 200, y: 0, w: 200, h: 100 });
    const line = transformShape(s({ type: "line", x: 0, y: 0, w: 200, h: 50 }), from, to);
    expect([line.w, line.h]).toEqual([400, 100]);
  });

  it("finds resize handles within a radius", () => {
    expect(handleAt({ x: 0, y: 0, w: 100, h: 50 }, 101, 49, 4)).toBe("se");
    expect(handleAt({ x: 0, y: 0, w: 100, h: 50 }, 50, 25, 4)).toBe(null);
  });

  it("re-bases pen strokes to their bounding box", () => {
    const p = normalizePen(s({ type: "pen", x: 10, y: 10, points: [[0, 0, 0.5], [-5, 20, 0.5], [30, 4, 0.5]] }));
    expect([p.x, p.y, p.w, p.h]).toEqual([5, 10, 35, 20]);
    expect(p.points![1]).toEqual([0, 20, 0.5]);
  });

  it("snaps angles to 15° steps", () => {
    const { dx, dy } = snapAngle(100, 8);
    expect(dy).toBeCloseTo(0);
    expect(dx).toBeCloseTo(Math.hypot(100, 8));
  });
});

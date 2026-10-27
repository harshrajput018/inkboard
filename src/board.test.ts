import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Board } from "./board";
import type { Shape } from "./types";

const shape = (id: string, over: Partial<Shape> = {}): Shape => ({ id, type: "rect", x: 0, y: 0, w: 10, h: 10, z: 1, stroke: "ink", fill: "none", strokeWidth: 2, ...over });

/** Two boards wired together the way two browser tabs are. */
function pair() {
  const a = new Board();
  const b = new Board();
  a.doc.on("update", (u: Uint8Array, origin: unknown) => origin !== "remote" && Y.applyUpdate(b.doc, u, "remote"));
  b.doc.on("update", (u: Uint8Array, origin: unknown) => origin !== "remote" && Y.applyUpdate(a.doc, u, "remote"));
  return { a, b };
}

describe("Board sync", () => {
  it("converges when both peers edit different shapes", () => {
    const { a, b } = pair();
    a.put([shape("one")]);
    b.put([shape("two", { x: 50 })]);
    expect(a.shapes.map((s) => s.id).sort()).toEqual(["one", "two"]);
    expect(b.shapes).toEqual(a.shapes);
  });

  it("converges after edits made while disconnected", () => {
    const a = new Board();
    const b = new Board();
    a.put([shape("one")]);
    b.put([shape("two")]);
    b.remove(["two"]);
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
    expect(a.shapes).toEqual(b.shapes);
    expect(a.shapes.map((s) => s.id)).toEqual(["one"]);
  });

  it("keeps shapes ordered by z", () => {
    const a = new Board();
    a.put([shape("top", { z: 5 }), shape("bottom", { z: -2 }), shape("mid", { z: 1 })]);
    expect(a.shapes.map((s) => s.id)).toEqual(["bottom", "mid", "top"]);
    expect(a.maxZ()).toBe(5);
    expect(a.minZ()).toBe(-2);
  });
});

describe("per-user undo", () => {
  it("undo reverts only this peer's changes", () => {
    const { a, b } = pair();
    a.put([shape("mine")]);
    a.checkpoint();
    b.put([shape("theirs")]);
    b.checkpoint();

    a.undo();
    expect(a.shapes.map((s) => s.id)).toEqual(["theirs"]);
    expect(b.shapes.map((s) => s.id)).toEqual(["theirs"]);

    a.redo();
    expect(b.shapes.map((s) => s.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("groups a whole drag gesture into a single undo step", () => {
    const a = new Board();
    a.put([shape("s")]);
    a.checkpoint();
    for (let x = 1; x <= 30; x++) a.patch("s", { x }); // 30 pointermoves
    a.checkpoint();
    expect(a.get("s")!.x).toBe(30);
    a.undo();
    expect(a.get("s")!.x).toBe(0);
  });
});

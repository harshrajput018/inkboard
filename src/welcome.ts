import { measureText } from "./render";
import type { Shape } from "./types";

let z = 0;
const base = (s: Partial<Shape> & Pick<Shape, "type" | "x" | "y" | "w" | "h">): Shape => ({
  id: crypto.randomUUID(),
  z: ++z,
  stroke: "ink",
  fill: "none",
  strokeWidth: 2,
  ...s,
});
const text = (x: number, y: number, t: string, fontSize = 24, stroke = "ink") => base({ type: "text", x, y, text: t, fontSize, stroke, ...measureText(t, fontSize) });

export function welcomeShapes(): Shape[] {
  return [
    text(0, 0, "Welcome to Inkboard", 44),
    text(2, 64, "A multiplayer whiteboard: canvas rendering, CRDT sync, live cursors.", 20, "violet"),
    base({ type: "sticky", x: 0, y: 130, w: 220, h: 200, stroke: "ink", text: "Click Share, open the link in a second tab and draw in both 👀" }),
    base({ type: "sticky", x: 250, y: 130, w: 220, h: 200, stroke: "green", text: "⌘Z only undoes YOUR changes, not your teammate's." }),
    base({ type: "sticky", x: 500, y: 130, w: 220, h: 200, stroke: "blue", text: "Press R, O, D, A, P, T or N to pick a tool. Hold Shift to constrain." }),
    base({ type: "rect", x: 780, y: 140, w: 180, h: 110, stroke: "violet", fill: "tint" }),
    text(826, 178, "Drag me", 24, "violet"),
    base({ type: "arrow", x: 870, y: 270, w: -10, h: 90, stroke: "orange", strokeWidth: 2 }),
    base({ type: "ellipse", x: 790, y: 380, w: 150, h: 90, stroke: "red", fill: "tint" }),
    base({ type: "diamond", x: 980, y: 140, w: 130, h: 130, stroke: "blue" }),
  ];
}

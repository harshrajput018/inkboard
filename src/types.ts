export type ShapeType = "rect" | "ellipse" | "diamond" | "line" | "arrow" | "pen" | "text" | "sticky";
export type Fill = "none" | "tint" | "solid";

export type Shape = {
  id: string;
  type: ShapeType;
  /** Box shapes: top-left + size. Line/arrow: start point + vector (w/h may be negative). Pen: origin of `points`. */
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  stroke: string; // a palette key
  fill: Fill;
  strokeWidth: number;
  points?: number[][]; // pen only: [x, y, pressure], relative to (x, y)
  text?: string;
  fontSize?: number;
};

export type Tool = "select" | "hand" | "eraser" | ShapeType;
export type Camera = { x: number; y: number; zoom: number };
/** Normalised rectangle: w and h are never negative. */
export type Box = { x: number; y: number; w: number; h: number };
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type Style = { stroke: string; fill: Fill; strokeWidth: number };

export type Peer = {
  clientId: number;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
};

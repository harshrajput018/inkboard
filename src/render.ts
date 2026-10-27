import { getStroke } from "perfect-freehand";
import { HANDLES, boundsOf, handlePoint, intersects, union } from "./geometry";
import type { Box, Camera, Shape } from "./types";

export const FONT = "Kalam, 'Comic Sans MS', cursive";
export const LINE_HEIGHT = 1.3;
export const STICKY_PAD = 16;
export const STICKY_FONT = 20;

export const PALETTE: Record<string, { light: string; dark: string; sticky: string; label: string }> = {
  ink: { light: "#1e1e24", dark: "#e8e8ee", sticky: "#fff3a3", label: "Ink" },
  red: { light: "#e03131", dark: "#ff6b6b", sticky: "#ffc9c9", label: "Red" },
  orange: { light: "#e8590c", dark: "#ff922b", sticky: "#ffd8a8", label: "Orange" },
  green: { light: "#2f9e44", dark: "#51cf66", sticky: "#b2f2bb", label: "Green" },
  blue: { light: "#1971c2", dark: "#4dabf7", sticky: "#a5d8ff", label: "Blue" },
  violet: { light: "#7048e8", dark: "#9775fa", sticky: "#d0bfff", label: "Violet" },
};

export function color(key: string, dark: boolean) {
  const p = PALETTE[key] ?? PALETTE.ink;
  return dark ? p.dark : p.light;
}

function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;

export function measureText(text: string, fontSize: number) {
  const lines = (text || " ").split("\n");
  let w = 0;
  if (measureCtx) {
    measureCtx.font = `${fontSize}px ${FONT}`;
    for (const l of lines) w = Math.max(w, measureCtx.measureText(l || " ").width);
  }
  return { w: Math.ceil(w) + 4, h: Math.ceil(lines.length * fontSize * LINE_HEIGHT) };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function penPath(s: Shape) {
  const pts = getStroke(s.points ?? [], { size: s.strokeWidth * 3, thinning: 0.55, smoothing: 0.5, streamline: 0.45, simulatePressure: !(s.points?.some((p) => p[2] !== 0.5)) });
  const path = new Path2D();
  if (!pts.length) return path;
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

export function drawShape(ctx: CanvasRenderingContext2D, s: Shape, dark: boolean, hideText = false) {
  const stroke = color(s.stroke, dark);
  const fill = s.fill === "none" ? null : s.fill === "tint" ? alpha(stroke, dark ? 0.22 : 0.15) : stroke;
  ctx.lineWidth = s.strokeWidth;
  ctx.strokeStyle = stroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const b = boundsOf(s);

  const paint = () => {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.stroke();
  };

  switch (s.type) {
    case "rect":
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(10, b.w / 4, b.h / 4));
      paint();
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      paint();
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(b.x + b.w / 2, b.y);
      ctx.lineTo(b.x + b.w, b.y + b.h / 2);
      ctx.lineTo(b.x + b.w / 2, b.y + b.h);
      ctx.lineTo(b.x, b.y + b.h / 2);
      ctx.closePath();
      paint();
      break;
    case "line":
    case "arrow": {
      const x2 = s.x + s.w;
      const y2 = s.y + s.h;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(x2, y2);
      if (s.type === "arrow" && (s.w || s.h)) {
        const a = Math.atan2(s.h, s.w);
        const len = Math.min(Math.hypot(s.w, s.h) / 2, 10 + s.strokeWidth * 3);
        for (const side of [-1, 1]) {
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - len * Math.cos(a + side * 0.45), y2 - len * Math.sin(a + side * 0.45));
        }
      }
      ctx.stroke();
      break;
    }
    case "pen":
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = stroke;
      ctx.fill(penPath(s));
      ctx.restore();
      break;
    case "text": {
      if (hideText) break;
      const size = s.fontSize ?? 24;
      ctx.font = `${size}px ${FONT}`;
      ctx.fillStyle = stroke;
      ctx.textBaseline = "top";
      (s.text ?? "").split("\n").forEach((line, i) => ctx.fillText(line, b.x, b.y + i * size * LINE_HEIGHT + size * 0.1));
      break;
    }
    case "sticky": {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = (PALETTE[s.stroke] ?? PALETTE.ink).sticky;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.restore();
      if (hideText) break;
      ctx.font = `${STICKY_FONT}px ${FONT}`;
      ctx.fillStyle = "#1e1e24";
      ctx.textBaseline = "top";
      wrap(ctx, s.text ?? "", b.w - STICKY_PAD * 2).forEach((line, i) => {
        const y = b.y + STICKY_PAD + i * STICKY_FONT * LINE_HEIGHT;
        if (y + STICKY_FONT < b.y + b.h - 4) ctx.fillText(line, b.x + STICKY_PAD, y);
      });
      break;
    }
  }
}

export type Overlay = {
  selected: Set<string>;
  hovered: string | null;
  editing: string | null;
  marquee: Box | null;
  remote: { color: string; ids: string[] }[];
};

export function viewportBox(cam: Camera, w: number, h: number): Box {
  return { x: cam.x, y: cam.y, w: w / cam.zoom, h: h / cam.zoom };
}

export function render(ctx: CanvasRenderingContext2D, shapes: Shape[], cam: Camera, size: { w: number; h: number; dpr: number }, dark: boolean, o: Overlay) {
  const { w, h, dpr } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = dark ? "#121216" : "#fbfbfc";
  ctx.fillRect(0, 0, w, h);

  // Dot grid, in screen space so it stays crisp at any zoom
  const gap = 24 * cam.zoom;
  if (gap >= 10) {
    ctx.fillStyle = dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.11)";
    const ox = -((cam.x * cam.zoom) % gap);
    const oy = -((cam.y * cam.zoom) % gap);
    for (let x = ox; x < w; x += gap) for (let y = oy; y < h; y += gap) ctx.fillRect(x, y, 1.5, 1.5);
  }

  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr);
  const view = viewportBox(cam, w, h);
  const px = 1 / cam.zoom;

  for (const s of shapes) {
    // Culling: shapes outside the viewport cost nothing
    const b = boundsOf(s);
    if (!intersects(view, { x: b.x - 20, y: b.y - 20, w: b.w + 40, h: b.h + 40 })) continue;
    drawShape(ctx, s, dark, s.id === o.editing);
  }

  const byId = new Map(shapes.map((s) => [s.id, s]));
  const outline = (b: Box, stroke: string, dash: number[] = []) => {
    ctx.setLineDash(dash.map((d) => d * px));
    ctx.lineWidth = 1.5 * px;
    ctx.strokeStyle = stroke;
    ctx.strokeRect(b.x - 4 * px, b.y - 4 * px, b.w + 8 * px, b.h + 8 * px);
    ctx.setLineDash([]);
  };

  for (const r of o.remote) for (const id of r.ids) {
    const s = byId.get(id);
    if (s) outline(boundsOf(s), r.color, [4, 3]);
  }

  if (o.hovered && !o.selected.has(o.hovered)) {
    const s = byId.get(o.hovered);
    if (s) outline(boundsOf(s), dark ? "rgba(129,140,248,0.5)" : "rgba(79,70,229,0.4)");
  }

  const accent = dark ? "#818cf8" : "#4f46e5";
  const sel = [...o.selected].map((id) => byId.get(id)).filter(Boolean) as Shape[];
  if (sel.length > 1) for (const s of sel) outline(boundsOf(s), accent, [3, 3]);
  const box = union(sel.map(boundsOf));
  if (box && !o.editing) {
    outline(box, accent);
    const g = { x: box.x - 4 * px, y: box.y - 4 * px, w: box.w + 8 * px, h: box.h + 8 * px };
    for (const hdl of HANDLES) {
      const p = handlePoint(g, hdl);
      ctx.fillStyle = dark ? "#121216" : "#ffffff";
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      ctx.roundRect(p.x - 4.5 * px, p.y - 4.5 * px, 9 * px, 9 * px, 2 * px);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (o.marquee) {
    ctx.fillStyle = dark ? "rgba(129,140,248,0.12)" : "rgba(79,70,229,0.08)";
    ctx.strokeStyle = accent;
    ctx.lineWidth = px;
    ctx.fillRect(o.marquee.x, o.marquee.y, o.marquee.w, o.marquee.h);
    ctx.strokeRect(o.marquee.x, o.marquee.y, o.marquee.w, o.marquee.h);
  }
}

/** Renders shapes to a PNG blob at 2× — the whole board, or just the given shapes. */
export async function exportPng(shapes: Shape[], dark: boolean): Promise<Blob | null> {
  const box = union(shapes.map(boundsOf));
  if (!box) return null;
  const pad = 32;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = (box.w + pad * 2) * scale;
  canvas.height = (box.h + pad * 2) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = dark ? "#121216" : "#ffffff";
  ctx.fillRect(0, 0, box.w + pad * 2, box.h + pad * 2);
  ctx.translate(pad - box.x, pad - box.y);
  for (const s of shapes) drawShape(ctx, s, dark);
  return new Promise((r) => canvas.toBlob(r, "image/png"));
}

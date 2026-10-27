import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Board } from "./board";
import { boundsOf, boxFromPoints, contains, handleAt, normalizePen, resizeBox, snapAngle, topHit, transformShape, union } from "./geometry";
import { FONT, LINE_HEIGHT, PALETTE, STICKY_FONT, STICKY_PAD, color, exportPng, measureText, render } from "./render";
import type { Box, Camera, Handle, Peer, Shape, Style, Tool } from "./types";
import { Icon } from "./icons";

type Pt = { x: number; y: number };
type Gesture =
  | { kind: "pan"; sx: number; sy: number; cam: Camera }
  | { kind: "create"; id: string; start: Pt }
  | { kind: "pen"; id: string; origin: Pt; points: number[][] }
  | { kind: "move"; start: Pt; originals: Shape[] }
  | { kind: "resize"; start: Pt; handle: Handle; box: Box; originals: Shape[] }
  | { kind: "marquee"; start: Pt; base: Set<string> }
  | { kind: "erase" }
  | { kind: "pinch"; dist: number; mid: Pt; cam: Camera };

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: "select", label: "Select", key: "V" },
  { tool: "hand", label: "Hand", key: "H" },
  { tool: "rect", label: "Rectangle", key: "R" },
  { tool: "ellipse", label: "Ellipse", key: "O" },
  { tool: "diamond", label: "Diamond", key: "D" },
  { tool: "arrow", label: "Arrow", key: "A" },
  { tool: "line", label: "Line", key: "L" },
  { tool: "pen", label: "Draw", key: "P" },
  { tool: "text", label: "Text", key: "T" },
  { tool: "sticky", label: "Sticky note", key: "N" },
  { tool: "eraser", label: "Eraser", key: "E" },
];
const HANDLE_CURSOR: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const uid = () => crypto.randomUUID();

function useDark() {
  const query = "(prefers-color-scheme: dark)";
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
  );
}

export default function Whiteboard({ board, me }: { board: Board; me: { name: string; color: string } }) {
  const shapes = useSyncExternalStore(board.subscribe, () => board.shapes);
  const [tool, setTool] = useState<Tool>("select");
  const [style, setStyle] = useState<Style>({ stroke: "ink", fill: "none", strokeWidth: 2 });
  const [selectedRaw, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [cam, setCam] = useState<Camera>({ x: -120, y: -90, zoom: 1 });
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [cursor, setCursor] = useState("default");
  const [toast, setToast] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const dark = useDark();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const clipboard = useRef<Shape[]>([]);
  const camRef = useRef(cam);
  camRef.current = cam;

  // Drop ids of shapes that were deleted (locally, remotely or by undo)
  const selected = useMemo(() => new Set([...selectedRaw].filter((id) => board.get(id))), [selectedRaw, shapes, board]);
  const selShapes = useMemo(() => shapes.filter((s) => selected.has(s.id)), [shapes, selected]);
  const selBox = useMemo(() => union(selShapes.map(boundsOf)), [selShapes]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  // ── Presence ────────────────────────────────────────────────
  useEffect(() => {
    const { awareness } = board;
    const update = () => {
      const out: Peer[] = [];
      awareness.getStates().forEach((st, clientId) => {
        if (clientId === board.doc.clientID || !st.user) return;
        out.push({ clientId, name: st.user.name, color: st.user.color, cursor: st.cursor ?? null, selection: st.selection ?? [] });
      });
      setPeers(out);
    };
    awareness.on("change", update);
    update();
    return () => awareness.off("change", update);
  }, [board]);

  useEffect(() => {
    board.awareness.setLocalStateField("user", me);
  }, [board, me]);

  useEffect(() => {
    board.awareness.setLocalStateField("selection", [...selected]);
  }, [board, selected]);

  const cursorFrame = useRef(0);
  const shareCursor = (p: Pt | null) => {
    cancelAnimationFrame(cursorFrame.current);
    cursorFrame.current = requestAnimationFrame(() => board.awareness.setLocalStateField("cursor", p));
  };

  // ── Canvas size + drawing ───────────────────────────────────
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight, dpr: window.devicePixelRatio || 1 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    document.fonts.load(`20px Kalam`).finally(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const id = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d")!;
      render(ctx, shapes, cam, size, dark, {
        selected,
        hovered: gesture.current ? null : hovered,
        editing,
        marquee,
        remote: peers.map((p) => ({ color: p.color, ids: p.selection })),
      });
    });
    return () => cancelAnimationFrame(id);
  }, [shapes, cam, size, dark, selected, hovered, editing, marquee, peers, fontsReady]);

  // ── Camera ──────────────────────────────────────────────────
  const zoomAt = useCallback((sx: number, sy: number, zoom: number) => {
    setCam((c) => {
      const z = clampZoom(zoom);
      const wx = sx / c.zoom + c.x;
      const wy = sy / c.zoom + c.y;
      return { x: wx - sx / z, y: wy - sy / z, zoom: z };
    });
  }, []);

  const zoomBy = (factor: number) => zoomAt(size.w / 2, size.h / 2, camRef.current.zoom * factor);

  const fitTo = useCallback(
    (list: Shape[]) => {
      const b = union(list.map(boundsOf));
      if (!b || !size.w) return setCam({ x: -size.w / 2, y: -size.h / 2, zoom: 1 });
      const pad = 96;
      const zoom = clampZoom(Math.min((size.w - pad * 2) / Math.max(b.w, 1), (size.h - pad * 2) / Math.max(b.h, 1), 1.5));
      setCam({ zoom, x: b.x + b.w / 2 - size.w / 2 / zoom, y: b.y + b.h / 2 - size.h / 2 / zoom });
    },
    [size.w, size.h],
  );

  // Fit the board once on first load
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && size.w && shapes.length) {
      fitted.current = true;
      fitTo(shapes);
    }
  }, [size.w, shapes, fitTo]);

  useEffect(() => {
    const el = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, camRef.current.zoom * Math.exp(-e.deltaY * 0.01));
      else setCam((c) => ({ ...c, x: c.x + e.deltaX / c.zoom, y: c.y + e.deltaY / c.zoom }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ── Helpers ─────────────────────────────────────────────────
  const screenPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const s = screenPt(e);
    const c = camRef.current;
    return { x: s.x / c.zoom + c.x, y: s.y / c.zoom + c.y };
  };
  const paddedSel = (zoom: number) => (selBox ? { x: selBox.x - 4 / zoom, y: selBox.y - 4 / zoom, w: selBox.w + 8 / zoom, h: selBox.h + 8 / zoom } : null);

  const newShape = (type: Shape["type"], p: Pt, extra: Partial<Shape> = {}): Shape => ({
    id: uid(),
    type,
    x: p.x,
    y: p.y,
    w: 0,
    h: 0,
    z: board.maxZ() + 1,
    stroke: style.stroke,
    fill: style.fill,
    strokeWidth: style.strokeWidth,
    ...extra,
  });

  // ── Pointer state machine ───────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) return;
    canvasRef.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, screenPt(e));

    if (pointers.current.size === 2) {
      // Second finger: switch to pinch-zoom, abandon whatever the first finger started
      const [a, b] = [...pointers.current.values()];
      board.checkpoint();
      gesture.current = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: camRef.current };
      setMarquee(null);
      return;
    }

    const p = toWorld(e);
    const zoom = camRef.current.zoom;
    board.checkpoint();

    if (e.button === 1 || tool === "hand" || spaceHeld) {
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, cam: camRef.current };
      setCursor("grabbing");
      return;
    }

    switch (tool) {
      case "select": {
        const pad = paddedSel(zoom);
        const h = pad && handleAt(pad, p.x, p.y, 8 / zoom);
        if (h && selBox) {
          gesture.current = { kind: "resize", start: p, handle: h, box: selBox, originals: selShapes };
          return;
        }
        const hit = topHit(shapes, p.x, p.y, 6 / zoom);
        if (hit) {
          let next = selected;
          if (e.shiftKey) {
            next = new Set(selected);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
          } else if (!selected.has(hit.id)) next = new Set([hit.id]);
          setSelected(next);
          gesture.current = { kind: "move", start: p, originals: shapes.filter((s) => next.has(s.id)) };
        } else {
          const base = e.shiftKey ? new Set(selected) : new Set<string>();
          setSelected(base);
          gesture.current = { kind: "marquee", start: p, base };
        }
        return;
      }
      case "eraser": {
        gesture.current = { kind: "erase" };
        const hit = topHit(shapes, p.x, p.y, 6 / zoom);
        if (hit) board.remove([hit.id]);
        return;
      }
      case "pen": {
        const s = newShape("pen", p, { points: [[0, 0, e.pressure || 0.5]] });
        board.put([s]);
        gesture.current = { kind: "pen", id: s.id, origin: p, points: s.points! };
        return;
      }
      case "text": {
        const hit = topHit(shapes, p.x, p.y, 6 / zoom);
        if (hit?.type === "text" || hit?.type === "sticky") return startEditing(hit.id);
        const fontSize = 16 + style.strokeWidth * 4;
        const s = newShape("text", { x: p.x, y: p.y - fontSize * 0.65 }, { text: "", fontSize, fill: "none", ...measureText("", fontSize) });
        board.put([s]);
        setTool("select");
        startEditing(s.id);
        return;
      }
      case "sticky": {
        const s = newShape("sticky", { x: p.x - 100, y: p.y - 100 }, { w: 200, h: 200, text: "" });
        board.put([s]);
        setTool("select");
        startEditing(s.id);
        return;
      }
      default: {
        const s = newShape(tool, p);
        board.put([s]);
        gesture.current = { kind: "create", id: s.id, start: p };
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toWorld(e);
    shareCursor(p);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, screenPt(e));
    const g = gesture.current;
    const zoom = camRef.current.zoom;

    if (!g) {
      // Hover feedback only
      if (tool !== "select" || spaceHeld) return;
      const pad = paddedSel(zoom);
      const h = pad && handleAt(pad, p.x, p.y, 8 / zoom);
      const hit = h ? null : topHit(shapes, p.x, p.y, 6 / zoom);
      setHovered(hit?.id ?? null);
      setCursor(h ? HANDLE_CURSOR[h] : hit ? "move" : "default");
      return;
    }

    switch (g.kind) {
      case "pinch": {
        const pts = [...pointers.current.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const z = clampZoom(g.cam.zoom * (dist / g.dist));
        const wx = g.mid.x / g.cam.zoom + g.cam.x;
        const wy = g.mid.y / g.cam.zoom + g.cam.y;
        setCam({ zoom: z, x: wx - mid.x / z, y: wy - mid.y / z });
        return;
      }
      case "pan":
        setCam({ ...g.cam, x: g.cam.x - (e.clientX - g.sx) / g.cam.zoom, y: g.cam.y - (e.clientY - g.sy) / g.cam.zoom });
        return;
      case "create": {
        let dx = p.x - g.start.x;
        let dy = p.y - g.start.y;
        const type = board.get(g.id)?.type;
        if (e.shiftKey) {
          if (type === "line" || type === "arrow") ({ dx, dy } = snapAngle(dx, dy));
          else {
            const m = Math.max(Math.abs(dx), Math.abs(dy));
            dx = m * Math.sign(dx || 1);
            dy = m * Math.sign(dy || 1);
          }
        }
        if (type === "line" || type === "arrow") board.patch(g.id, { w: dx, h: dy });
        else board.patch(g.id, normalizeBox(g.start, dx, dy));
        return;
      }
      case "pen": {
        // Coalesced events give smoother strokes on fast devices
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
        for (const ev of events) {
          const q = toWorld(ev);
          g.points.push([q.x - g.origin.x, q.y - g.origin.y, ev.pressure || 0.5]);
        }
        board.patch(g.id, { points: [...g.points] });
        return;
      }
      case "move": {
        let dx = p.x - g.start.x;
        let dy = p.y - g.start.y;
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
        board.put(g.originals.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })));
        return;
      }
      case "resize": {
        const keep = e.shiftKey || g.originals.some((s) => s.type === "text");
        const next = resizeBox(g.box, g.handle, p.x - g.start.x, p.y - g.start.y, keep);
        board.put(g.originals.map((s) => transformShape(s, g.box, next)));
        return;
      }
      case "marquee": {
        const m = boxFromPoints(g.start, p);
        setMarquee(m);
        const next = new Set(g.base);
        for (const s of shapes) if (contains(m, boundsOf(s))) next.add(s.id);
        setSelected(next);
        return;
      }
      case "erase": {
        const hit = topHit(shapes, p.x, p.y, 6 / zoom);
        if (hit) board.remove([hit.id]);
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    setMarquee(null);
    if (!g) return;

    if (g.kind === "pan") setCursor(tool === "hand" || spaceHeld ? "grab" : "default");
    if (g.kind === "create") {
      const s = board.get(g.id);
      if (s) {
        const zoom = camRef.current.zoom;
        const tiny = Math.abs(s.w) * zoom < 4 && Math.abs(s.h) * zoom < 4;
        // A click without a drag drops a default-sized shape
        if (tiny) board.patch(g.id, s.type === "line" || s.type === "arrow" ? { w: 160, h: 0 } : { x: s.x - 80, y: s.y - 50, w: 160, h: 100 });
        setSelected(new Set([g.id]));
        setTool("select");
      }
    }
    if (g.kind === "pen") {
      const s = board.get(g.id);
      if (s) board.put([normalizePen(s)]);
    }
    board.checkpoint();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "select") return;
    const p = toWorld(e);
    const hit = topHit(shapes, p.x, p.y, 6 / camRef.current.zoom);
    if (hit?.type === "text" || hit?.type === "sticky") return startEditing(hit.id);
    if (!hit) {
      const fontSize = 16 + style.strokeWidth * 4;
      const s = newShape("text", { x: p.x, y: p.y - fontSize * 0.65 }, { text: "", fontSize, fill: "none", ...measureText("", fontSize) });
      board.checkpoint();
      board.put([s]);
      startEditing(s.id);
    }
  };

  // ── Text editing ────────────────────────────────────────────
  function startEditing(id: string) {
    board.checkpoint();
    setSelected(new Set([id]));
    setEditing(id);
  }

  const finishEditing = () => {
    const s = editing ? board.get(editing) : null;
    if (s?.type === "text" && !s.text?.trim()) board.remove([s.id]);
    board.checkpoint();
    setEditing(null);
  };

  // ── Actions ─────────────────────────────────────────────────
  const discrete = (fn: () => void) => {
    board.checkpoint();
    fn();
    board.checkpoint();
  };

  const actions = {
    remove: () => discrete(() => board.remove(selected)),
    duplicate: (list = selShapes, offset = 24) => {
      if (!list.length) return;
      const z = board.maxZ();
      const copies = list.map((s, i) => ({ ...s, id: uid(), x: s.x + offset, y: s.y + offset, z: z + 1 + i }));
      discrete(() => board.put(copies));
      setSelected(new Set(copies.map((c) => c.id)));
    },
    front: () => {
      const z = board.maxZ();
      discrete(() => board.put(selShapes.map((s, i) => ({ ...s, z: z + 1 + i }))));
    },
    back: () => {
      const z = board.minZ();
      discrete(() => board.put(selShapes.map((s, i) => ({ ...s, z: z - selShapes.length + i }))));
    },
    nudge: (dx: number, dy: number) => discrete(() => board.put(selShapes.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })))),
    style: (partial: Partial<Style>) => {
      setStyle((st) => ({ ...st, ...partial }));
      if (selShapes.length) discrete(() => board.put(selShapes.map((s) => ({ ...s, ...partial }))));
    },
    export: async () => {
      const blob = await exportPng(selShapes.length ? selShapes : shapes, dark);
      if (!blob) return flash("Nothing to export yet");
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: "inkboard.png" }).click();
      URL.revokeObjectURL(url);
      flash(selShapes.length ? `Exported ${selShapes.length} shape${selShapes.length > 1 ? "s" : ""}` : "Exported board");
    },
    share: () => {
      navigator.clipboard?.writeText(location.href).then(
        () => flash("Link copied: open it in another tab to collaborate"),
        () => flash("Couldn't access the clipboard"),
      );
    },
  };

  // ── Keyboard ────────────────────────────────────────────────
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const run = (fn: () => void) => {
      e.preventDefault();
      fn();
    };
    if (e.key === " ") return run(() => !spaceHeld && (setSpaceHeld(true), setCursor("grab")));
    if (mod && k === "z") return run(() => (e.shiftKey ? board.redo() : board.undo()));
    if (mod && k === "y") return run(() => board.redo());
    if (mod && k === "a") return run(() => setSelected(new Set(shapes.map((s) => s.id))));
    if (mod && k === "d") return run(() => actions.duplicate());
    if (mod && k === "c") return run(() => (clipboard.current = selShapes));
    if (mod && k === "x") return run(() => ((clipboard.current = selShapes), actions.remove()));
    if (mod && k === "v") return run(() => actions.duplicate(clipboard.current, 32));
    if (mod && (k === "=" || k === "+")) return run(() => zoomBy(1.25));
    if (mod && k === "-") return run(() => zoomBy(0.8));
    if (mod && k === "0") return run(() => zoomAt(size.w / 2, size.h / 2, 1));
    if (e.shiftKey && (e.key === "!" || e.code === "Digit1")) return run(() => fitTo(shapes));
    if (e.key === "Delete" || e.key === "Backspace") return run(actions.remove);
    if (e.key === "Escape") return run(() => (setSelected(new Set()), setTool("select")));
    if (e.key === "]") return run(actions.front);
    if (e.key === "[") return run(actions.back);
    if (e.key === "Enter" && selShapes.length === 1 && (selShapes[0].type === "text" || selShapes[0].type === "sticky")) return run(() => startEditing(selShapes[0].id));
    const step = e.shiftKey ? 10 : 1;
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    if (arrows[e.key] && selShapes.length) return run(() => actions.nudge(...arrows[e.key]));
    if (!mod && !e.altKey) {
      const t = TOOLS.find((x) => x.key.toLowerCase() === k);
      if (t) run(() => setTool(t.tool));
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => onKey.current(e);
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setSpaceHeld(false);
        setCursor("default");
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const canvasCursor = spaceHeld || tool === "hand" ? (gesture.current?.kind === "pan" ? "grabbing" : "grab") : tool === "select" ? cursor : tool === "text" ? "text" : "crosshair";
  const editingShape = editing ? board.get(editing) : undefined;
  const showStyle = selShapes.length > 0 || !["select", "hand", "eraser"].includes(tool);
  const current = selShapes[0] ?? style;

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-canvas text-fg">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          width={Math.round(size.w * size.dpr)}
          height={Math.round(size.h * size.dpr)}
          style={{ width: size.w, height: size.h, cursor: canvasCursor }}
          className="block touch-none"
          aria-label="Whiteboard canvas"
          role="img"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            shareCursor(null);
            setHovered(null);
          }}
          onDoubleClick={onDoubleClick}
        />
      </div>

      {editingShape && <TextEditor key={editingShape.id} shape={editingShape} cam={cam} dark={dark} board={board} onDone={finishEditing} />}

      {/* Remote cursors */}
      {peers.map(
        (p) =>
          p.cursor && (
            <div
              key={p.clientId}
              className="pointer-events-none absolute left-0 top-0 z-20 transition-transform duration-75 ease-linear"
              style={{ transform: `translate(${(p.cursor.x - cam.x) * cam.zoom}px, ${(p.cursor.y - cam.y) * cam.zoom}px)` }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M1 1l6 15 2.2-6.3L16 7.5z" fill={p.color} stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span className="ml-3 rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow" style={{ background: p.color }}>
                {p.name}
              </span>
            </div>
          ),
      )}

      {/* Toolbar */}
      <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2">
        <div role="toolbar" aria-label="Tools" className="flex items-center gap-0.5 rounded-xl border border-line bg-panel p-1 shadow-lg">
          {TOOLS.map((t, i) => (
            <button
              key={t.tool}
              type="button"
              title={`${t.label} — ${t.key}`}
              aria-label={t.label}
              aria-pressed={tool === t.tool}
              onClick={() => setTool(t.tool)}
              className={`relative grid h-9 w-9 place-items-center rounded-lg transition ${tool === t.tool ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-fg"} ${i === 2 || i === 7 || i === 10 ? "ml-1.5" : ""}`}
            >
              <Icon name={t.tool} />
              <span className="absolute bottom-0.5 right-1 text-[8px] font-medium opacity-60">{t.key}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Top-left brand */}
      <div className="absolute left-3 top-3 z-30 flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 shadow-lg">
        <span className="font-hand text-lg font-bold leading-none text-accent">Inkboard</span>
        <span className="hidden text-xs text-muted sm:inline">{shapes.length} shapes</span>
      </div>

      {/* Presence + share */}
      <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-line bg-panel py-1.5 pl-2 pr-3 shadow-lg" aria-label={`${peers.length + 1} people here`}>
          <div className="flex -space-x-2">
            {[{ ...me, clientId: board.doc.clientID }, ...peers].slice(0, 5).map((p, i) => (
              <span key={p.clientId} title={i === 0 ? `${p.name} (you)` : p.name} className="grid h-7 w-7 place-items-center rounded-full border-2 border-panel text-[11px] font-semibold text-white" style={{ background: p.color }}>
                {p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </span>
            ))}
          </div>
          <span className="ml-2 text-xs text-muted">{peers.length ? `${peers.length + 1} here` : "Just you"}</span>
        </div>
        <button type="button" onClick={() => window.open(location.href, "_blank")} title="Open this board in a new tab" className="hidden h-10 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-sm shadow-lg hover:bg-hover md:flex">
          <Icon name="tab" /> New tab
        </button>
        <button type="button" onClick={actions.share} className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-medium text-white shadow-lg hover:opacity-90">
          <Icon name="link" /> Share
        </button>
      </div>

      {/* Style panel */}
      {showStyle && (
        <aside aria-label="Style" className="absolute left-3 top-20 z-30 w-52 rounded-xl border border-line bg-panel p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Colour</p>
          <div className="flex gap-1.5">
            {Object.entries(PALETTE).map(([key, p]) => (
              <button
                key={key}
                type="button"
                aria-label={p.label}
                aria-pressed={current.stroke === key}
                onClick={() => actions.style({ stroke: key })}
                className={`h-6 w-6 rounded-md border-2 transition ${current.stroke === key ? "border-accent" : "border-transparent"}`}
                style={{ background: color(key, dark) }}
              />
            ))}
          </div>
          <p className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wide text-muted">Fill</p>
          <div className="grid grid-cols-3 gap-1">
            {(["none", "tint", "solid"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={current.fill === f} onClick={() => actions.style({ fill: f })} className={`rounded-md border py-1 text-xs capitalize ${current.fill === f ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg"}`}>
                {f}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wide text-muted">Stroke</p>
          <div className="grid grid-cols-3 gap-1">
            {[1, 2, 4].map((w) => (
              <button key={w} type="button" aria-label={`Stroke width ${w}`} aria-pressed={current.strokeWidth === w} onClick={() => actions.style({ strokeWidth: w })} className={`grid h-7 place-items-center rounded-md border ${current.strokeWidth === w ? "border-accent bg-accent-soft" : "border-line hover:bg-hover"}`}>
                <span className="block w-6 rounded-full bg-fg" style={{ height: w + 0.5 }} />
              </button>
            ))}
          </div>
          {selShapes.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wide text-muted">Actions</p>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    ["copy", "Duplicate (⌘D)", () => actions.duplicate()],
                    ["front", "Bring to front (])", actions.front],
                    ["back", "Send to back ([)", actions.back],
                    ["trash", "Delete (⌫)", actions.remove],
                  ] as const
                ).map(([icon, label, fn]) => (
                  <button key={icon} type="button" title={label} aria-label={label} onClick={() => fn()} className="grid h-8 place-items-center rounded-md border border-line text-muted hover:bg-hover hover:text-fg">
                    <Icon name={icon} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
      )}

      {/* Bottom-left: zoom + history */}
      <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-line bg-panel p-1 shadow-lg">
          <IconButton icon="minus" label="Zoom out (⌘−)" onClick={() => zoomBy(0.8)} />
          <button type="button" onClick={() => zoomAt(size.w / 2, size.h / 2, 1)} title="Reset zoom (⌘0)" className="w-14 rounded-md py-1.5 text-center font-mono text-xs tabular-nums text-muted hover:bg-hover hover:text-fg">
            {Math.round(cam.zoom * 100)}%
          </button>
          <IconButton icon="plus" label="Zoom in (⌘+)" onClick={() => zoomBy(1.25)} />
          <IconButton icon="fit" label="Zoom to fit (⇧1)" onClick={() => fitTo(shapes)} />
        </div>
        <div className="flex items-center rounded-xl border border-line bg-panel p-1 shadow-lg">
          <IconButton icon="undo" label="Undo (⌘Z)" onClick={() => board.undo()} disabled={!board.undoManager.canUndo()} />
          <IconButton icon="redo" label="Redo (⌘⇧Z)" onClick={() => board.redo()} disabled={!board.undoManager.canRedo()} />
        </div>
        <div className="flex items-center rounded-xl border border-line bg-panel p-1 shadow-lg">
          <IconButton icon="download" label={selShapes.length ? "Export selection as PNG" : "Export board as PNG"} onClick={actions.export} />
        </div>
      </div>

      {/* Bottom-right hint */}
      <p className="pointer-events-none absolute bottom-4 right-4 z-30 hidden max-w-xs text-right text-xs leading-relaxed text-muted lg:block">
        Scroll to pan · ⌘/Ctrl + scroll to zoom · Space-drag to pan · Shift to constrain · Double-click for text
        <br />
        Undo only reverts <b className="text-fg">your</b> changes, never a collaborator&apos;s.
      </p>

      <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-16 left-1/2 z-40 -translate-x-1/2">
        {toast && <div className="rounded-lg bg-fg px-3 py-2 text-sm text-canvas shadow-lg">{toast}</div>}
      </div>
    </div>
  );
}

function normalizeBox(start: Pt, dx: number, dy: number) {
  return { x: Math.min(start.x, start.x + dx), y: Math.min(start.y, start.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

function IconButton({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-hover hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent">
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

function TextEditor({ shape, cam, dark, board, onDone }: { shape: Shape; cam: Camera; dark: boolean; board: Board; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const sticky = shape.type === "sticky";
  const fontSize = (sticky ? STICKY_FONT : shape.fontSize ?? 24) * cam.zoom;
  const b = boundsOf(shape);

  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const style: React.CSSProperties = sticky
    ? { left: (b.x - cam.x) * cam.zoom, top: (b.y - cam.y) * cam.zoom, width: b.w * cam.zoom, height: b.h * cam.zoom, padding: STICKY_PAD * cam.zoom, color: "#1e1e24" }
    : { left: (b.x - cam.x) * cam.zoom, top: (b.y - cam.y) * cam.zoom, width: (b.w + (shape.fontSize ?? 24)) * cam.zoom, height: (b.h + 4) * cam.zoom, color: color(shape.stroke, dark) };

  return (
    <textarea
      ref={ref}
      defaultValue={shape.text}
      aria-label={sticky ? "Sticky note text" : "Text"}
      spellCheck={false}
      placeholder={sticky ? "Type a note…" : "Type…"}
      onInput={(e) => {
        const text = e.currentTarget.value;
        board.patch(shape.id, sticky ? { text } : { text, ...measureText(text, shape.fontSize ?? 24) });
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) e.currentTarget.blur();
      }}
      onBlur={onDone}
      className="absolute z-20 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:opacity-50"
      style={{ ...style, fontFamily: FONT, fontSize, lineHeight: LINE_HEIGHT, paddingTop: sticky ? STICKY_PAD * cam.zoom : fontSize * 0.1 }}
    />
  );
}

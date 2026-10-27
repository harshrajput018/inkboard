import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import type { Shape } from "./types";

/** Transaction origin for this tab's edits — the undo manager only tracks these. */
export const LOCAL = { local: true };

/**
 * The shared document. Every shape lives in one Y.Map keyed by id, so concurrent edits
 * to different shapes never conflict and the CRDT converges without a server.
 */
export class Board {
  readonly doc: Y.Doc;
  readonly map: Y.Map<Shape>;
  readonly awareness: Awareness;
  readonly undoManager: Y.UndoManager;
  private snapshot: Shape[] = [];
  private listeners = new Set<() => void>();

  constructor(doc = new Y.Doc()) {
    this.doc = doc;
    this.map = doc.getMap<Shape>("shapes");
    this.awareness = new Awareness(doc);
    // Infinite capture window: one gesture = one undo step, closed explicitly with checkpoint().
    this.undoManager = new Y.UndoManager(this.map, { trackedOrigins: new Set([LOCAL]), captureTimeout: Number.MAX_SAFE_INTEGER });
    this.map.observe(() => {
      this.snapshot = [...this.map.values()].sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
      this.emit();
    });
    this.undoManager.on("stack-item-added", () => this.emit());
    this.undoManager.on("stack-item-popped", () => this.emit());
  }

  get shapes() {
    return this.snapshot;
  }

  get(id: string) {
    return this.map.get(id);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  put(shapes: Shape[]) {
    this.doc.transact(() => shapes.forEach((s) => this.map.set(s.id, s)), LOCAL);
  }

  patch(id: string, partial: Partial<Shape>) {
    const cur = this.map.get(id);
    if (cur) this.doc.transact(() => this.map.set(id, { ...cur, ...partial }), LOCAL);
  }

  remove(ids: Iterable<string>) {
    this.doc.transact(() => {
      for (const id of ids) this.map.delete(id);
    }, LOCAL);
  }

  /** Ends the current undo step. Call before and after each gesture or discrete action. */
  checkpoint() {
    this.undoManager.stopCapturing();
  }

  undo() {
    this.checkpoint();
    this.undoManager.undo();
  }

  redo() {
    this.checkpoint();
    this.undoManager.redo();
  }

  maxZ() {
    return this.snapshot.length ? this.snapshot[this.snapshot.length - 1].z : 0;
  }

  minZ() {
    return this.snapshot.length ? this.snapshot[0].z : 0;
  }
}

/**
 * Minimal Yjs provider over BroadcastChannel: every tab of this browser on the same room
 * syncs document updates and presence. Swap for y-websocket to sync across machines.
 */
export function connectTabs(board: Board, room: string) {
  const { doc, awareness } = board;
  const bc = new BroadcastChannel(`inkboard:${room}`);
  type Msg = { t: "update"; u: Uint8Array } | { t: "awareness"; u: Uint8Array } | { t: "hello"; sv: Uint8Array };

  const onDoc = (u: Uint8Array, origin: unknown) => {
    if (origin !== bc) bc.postMessage({ t: "update", u } satisfies Msg);
  };
  const onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === bc) return;
    bc.postMessage({ t: "awareness", u: encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]) } satisfies Msg);
  };
  doc.on("update", onDoc);
  awareness.on("update", onAwareness);

  bc.onmessage = (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (m.t === "update") Y.applyUpdate(doc, m.u, bc);
    else if (m.t === "awareness") applyAwarenessUpdate(awareness, m.u, bc);
    else if (m.t === "hello") {
      // A new tab joined: send what it's missing, plus who's here, and ask for what we're missing.
      bc.postMessage({ t: "update", u: Y.encodeStateAsUpdate(doc, m.sv) } satisfies Msg);
      bc.postMessage({ t: "awareness", u: encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]) } satisfies Msg);
    }
  };

  const hello = () => bc.postMessage({ t: "hello", sv: Y.encodeStateVector(doc) } satisfies Msg);
  hello();

  const leave = () => removeAwarenessStates(awareness, [doc.clientID], "unload");
  window.addEventListener("pagehide", leave);

  return {
    /** Push everything we have — used once local persistence has loaded. */
    announce: () => {
      bc.postMessage({ t: "update", u: Y.encodeStateAsUpdate(doc) } satisfies Msg);
      hello();
    },
    destroy: () => {
      leave();
      window.removeEventListener("pagehide", leave);
      doc.off("update", onDoc);
      awareness.off("update", onAwareness);
      bc.close();
    },
  };
}

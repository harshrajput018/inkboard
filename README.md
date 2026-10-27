# Inkboard: a real-time multiplayer whiteboard

An Excalidraw-style whiteboard built on **Canvas 2D + Yjs CRDTs**: shapes, freehand ink, text and sticky notes, with live cursors and conflict-free multiplayer.

## What's in it
- **Canvas renderer.** A single `<canvas>` that is DPR-aware, with viewport culling, a crisp screen-space dot grid and zoom from 10% to 800% around the cursor.
- **Tools:** select, hand, rectangle, ellipse, diamond, arrow, line, freehand pen, text, sticky note and eraser, each on a one-key shortcut.
- **Freehand ink** with pressure (via `perfect-freehand`) and coalesced pointer events for smooth strokes.
- **Selection**: click, shift-click, marquee, move, 8-handle resize for single shapes *and groups*, aspect lock, 15° angle snapping, nudge with the arrow keys, z-order, duplicate, copy and paste.
- **Multiplayer.** The board is a Yjs document, so concurrent edits merge without conflicts. A small custom provider syncs every tab of the browser over `BroadcastChannel`; swap in `y-websocket` to go across machines.
- **Presence**: live cursors with names, collaborators' selections outlined in their colour, and an avatar stack.
- **Per-user undo.** ⌘Z undoes only *your* changes, never a collaborator's (`Y.UndoManager` with tracked origins), and a whole drag gesture is one undo step.
- **Offline persistence** in IndexedDB (`y-indexeddb`), plus PNG export of the board or the selection.
- **Touch**: pinch to zoom, two-finger pan, Pencil pressure.

## Try multiplayer
Run it, click **New tab** (or open the same URL with its `#room=` hash in another tab), and draw in both.

## Run
```bash
npm install
npm run dev
npm test        # geometry + CRDT sync + per-user undo tests
npm run build
```

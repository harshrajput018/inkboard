import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { IndexeddbPersistence } from "y-indexeddb";
import { Board, connectTabs } from "./board";
import { welcomeShapes } from "./welcome";
import Whiteboard from "./Whiteboard";
import "./index.css";

const ANIMALS = ["Panda", "Otter", "Falcon", "Koala", "Lynx", "Heron", "Fox", "Yak", "Orca", "Ibis"];
const ADJ = ["Curious", "Swift", "Sunny", "Clever", "Brave", "Calm", "Witty", "Bold"];
const COLORS = ["#e8590c", "#2f9e44", "#1971c2", "#c2255c", "#7048e8", "#0c8599", "#f08c00"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// Room lives in the URL hash, so sharing the link shares the board
let room = new URLSearchParams(location.hash.slice(1)).get("room");
const isNewRoom = !room;
if (!room) {
  room = Math.random().toString(36).slice(2, 10);
  history.replaceState(null, "", `#room=${room}`);
}

const board = new Board();
const me = { name: `${pick(ADJ)} ${pick(ANIMALS)}`, color: pick(COLORS) };
board.awareness.setLocalState({ user: me, cursor: null, selection: [] });

const tabs = connectTabs(board, room);
const persistence = new IndexeddbPersistence(`inkboard:${room}`, board.doc);
persistence.once("synced", () => {
  tabs.announce();
  // Only the tab that created the room seeds it, so two tabs never both add the welcome board
  if (isNewRoom && board.map.size === 0) {
    board.put(welcomeShapes());
    board.undoManager.clear();
  }
});

window.addEventListener("hashchange", () => location.reload());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Whiteboard board={board} me={me} />
  </StrictMode>,
);

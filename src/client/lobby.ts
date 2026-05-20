type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

type GameSummary = {
  id: number;
  status: string;
  player_count: number;
  created_at: string;
};

type Player = {
  id: number;
  user_id: number | null;
  username: string;
  color: string;
  turn_order: number;
};

type Pawn = {
  id: number;
  player_id: number;
  pawn_number: number;
  position: number;
  is_home: boolean;
  is_start: boolean;
  color: string;
  username: string;
};

type Card = {
  id: number;
  value: string;
  description: string;
  move_count: number | null;
};

type ValidMove = {
  pawnId: number;
  action: string;
  newRelative?: number;
  targetPawnId?: number;
  pawnId2?: number;
  newRelative2?: number;
  steps1?: number;
  label: string;
};

type Discard = {
  id: number;
  username: string;
  color: string;
  value: string;
  description: string;
  created_at: string;
};

type GameState = {
  game: {
    id: number;
    status: string;
    current_turn: number;
    winner_id: number | null;
    pending_card_id: number | null;
  };
  players: Player[];
  pawns: Pawn[];
  deckRemaining: number;
  discard: Discard[];
  myPlayerId: number | null;
  pendingCard: Card | null;
  validMoves: ValidMove[];
};

type SsePayload = {
  type?: string;
  gameId?: number;
  bump?: {
    bumperUsername: string;
    bumperColor: string;
    bumpedUsername: string;
    bumpedColor: string;
    pawnNumber: number;
  };
};

type StoreState = {
  connectionStatus: ConnectionStatus;
  games: GameSummary[];
  selectedGameId: number | null;
  gameState: GameState | null;
  message: string;
};

const store: StoreState = {
  connectionStatus: "disconnected",
  games: [],
  selectedGameId: null,
  gameState: null,
  message: "",
};

function updateStore(patch: Partial<StoreState>): void {
  Object.assign(store, patch);
  render();
}

function getElement(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function clearElement(element: HTMLElement): void {
  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
}

function appendText(parent: HTMLElement, tagName: string, text: string): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function makeButton(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

function showToast(message: string, duration = 3000): void {
  const toastContainer = document.getElementById("toast-container");
  if (toastContainer === null) {
    const container = document.createElement("div");
    container.id = "toast-container";
    container.style.position = "fixed";
    container.style.top = "20px";
    container.style.right = "20px";
    container.style.zIndex = "9999";
    document.body.appendChild(container);
  }

  const container = document.getElementById("toast-container");
  if (container === null) return;

  const toast = document.createElement("div");
  toast.style.cssText = `
    background: #333;
    color: white;
    padding: 12px 16px;
    border-radius: 4px;
    margin-bottom: 8px;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease";
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, duration);
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

async function loadGames(): Promise<void> {
  const games = await fetchJson<GameSummary[]>("/games");
  updateStore({ games });
}

async function loadGameState(gameId: number): Promise<void> {
  const gameState = await fetchJson<GameState>(`/games/${String(gameId)}`);
  sessionStorage.setItem("selectedGameId", String(gameId));
  updateStore({ selectedGameId: gameId, gameState });
}

async function createGame(): Promise<void> {
  try {
    const game = await fetchJson<{ id: number }>("/games", { method: "POST" });
    updateStore({ selectedGameId: game.id, message: `Created game #${String(game.id)}.` });
    await loadGames();
    await loadGameState(game.id);
  } catch (err) {
    updateStore({ message: err instanceof Error ? err.message : "Could not create game." });
  }
}

async function postAction(path: string, successMessage: string, body?: object): Promise<void> {
  const gameId = store.selectedGameId;
  if (gameId === null) return;

  try {
    await fetchJson<unknown>(`/games/${String(gameId)}/${path}`, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    showToast(successMessage);
    await loadGames();
    await loadGameState(gameId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Action failed.";
    showToast(errorMessage);
  }
}

async function playMove(move: ValidMove): Promise<void> {
  const body: Record<string, unknown> = { pawnId: move.pawnId, action: move.action };
  if (move.targetPawnId !== undefined) body.targetPawnId = move.targetPawnId;
  if (move.pawnId2 !== undefined) body.pawnId2 = move.pawnId2;
  if (move.steps1 !== undefined) body.steps1 = move.steps1;
  await postAction("move-pawn", "Move made.", body);
}

function connectSSE(): void {
  const eventSource = new EventSource("/api/sse");
  let wasConnected = false;

  eventSource.addEventListener("open", () => {
    if (wasConnected) {
      void loadGames();
      if (store.selectedGameId !== null) void loadGameState(store.selectedGameId);
    }
    wasConnected = true;
    updateStore({ connectionStatus: "connected" });
  });

  eventSource.addEventListener("error", () => {
    updateStore({ connectionStatus: "reconnecting" });
  });

  eventSource.addEventListener("message", (event: MessageEvent) => {
    void handleSseMessage(String(event.data));
  });
}

async function handleSseMessage(rawData: string): Promise<void> {
  const payload = JSON.parse(rawData) as SsePayload;

  if (payload.type === "gamesChanged") {
    await loadGames();
  }

  if (payload.type === "gameStateChanged" && payload.gameId === store.selectedGameId) {
    await loadGameState(payload.gameId);
  }

  if (payload.type === "bump" && payload.bump !== undefined) {
    const bump = payload.bump;
    showToast(
      `${bump.bumperUsername} bumped ${bump.bumpedUsername}'s pawn ${String(bump.pawnNumber)} back to start!`,
      4000,
    );
  }
}

// ─── Board rendering ──────────────────────────────────────────────────────────

const BOARD_SIZE = 16;
const CELL = 32;
const GAP = 2;
const STEP = CELL + GAP;
const START_ZONE_SIZE = CELL * 2 + GAP; // 66px

// Map DB position numbers to [row, col] on the 16×16 grid.
// Top row (row 0, cols 1-14): positions 1-14
// Right col (col 15, rows 1-14): positions 15-28
// Bottom row (row 15, cols 14-1): positions 29-42
// Left col (col 0, rows 14-1): positions 43-56
// Corners TL/TR/BR/BL: 57/58/59/60
const POSITION_TO_CELL: Record<number, [number, number]> = {};
for (let i = 0; i < 14; i++) POSITION_TO_CELL[i + 1] = [0, i + 1];
for (let i = 0; i < 14; i++) POSITION_TO_CELL[15 + i] = [i + 1, 15];
for (let i = 0; i < 14; i++) POSITION_TO_CELL[29 + i] = [15, 14 - i];
for (let i = 0; i < 14; i++) POSITION_TO_CELL[43 + i] = [14 - i, 0];
POSITION_TO_CELL[57] = [0, 0];
POSITION_TO_CELL[58] = [0, 15];
POSITION_TO_CELL[59] = [15, 15];
POSITION_TO_CELL[60] = [15, 0];

// DB position → grid [row, col]. Includes outer track + safe zone entry cells.
const DB_POS_TO_CELL: Record<number, [number, number]> = {
  // Safe zone entries (one step inside each color's home corridor)
  5: [0, 5], // red safe zone
  20: [5, 15], // blue safe zone
  35: [15, 9], // yellow safe zone
  50: [9, 0], // green safe zone
  // Top edge L→R (grid row 0): DB 1-4 map to cols 1-4, DB 7-14 map to cols 6-13, corners at col 0 & 15
  1: [0, 1],
  2: [0, 2],
  3: [0, 3],
  4: [0, 4],
  7: [0, 6],
  8: [0, 7],
  9: [0, 8],
  10: [0, 9],
  11: [0, 10],
  12: [0, 11],
  13: [0, 12],
  14: [0, 13],
  // Right edge T→B (grid col 15): DB 16-19 rows 1-4, DB 22-29 rows 6-13
  19: [1, 15],
  18: [2, 15],
  17: [3, 15],
  16: [4, 15],
  22: [6, 15],
  23: [7, 15],
  24: [8, 15],
  25: [9, 15],
  26: [10, 15],
  27: [11, 15],
  28: [12, 15],
  29: [13, 15],
  // Bottom edge R→L (grid row 15): DB 31-34 cols 13-10, DB 37-44 cols 8-1
  31: [15, 13],
  32: [15, 12],
  33: [15, 11],
  34: [15, 10],
  37: [15, 8],
  38: [15, 7],
  39: [15, 6],
  40: [15, 5],
  41: [15, 4],
  42: [15, 3],
  43: [15, 2],
  44: [15, 1],
  // Left edge B→T (grid col 0): DB 46-49 rows 13-10, DB 52-59 rows 8-1
  46: [13, 0],
  47: [12, 0],
  48: [11, 0],
  49: [10, 0],
  52: [8, 0],
  53: [7, 0],
  54: [6, 0],
  55: [5, 0],
  56: [4, 0],
  57: [3, 0],
  58: [2, 0],
  59: [1, 0],
};

// Start zone config: position in grid pixels, label transform
const START_ZONES: Record<
  string,
  {
    left: number;
    top: number;
    bg: string;
    border: string;
    textColor: string;
    labelTransform: string;
    labelOrigin: string;
    labelPos: Partial<Record<"top" | "bottom" | "left" | "right", string>>;
  }
> = {
  red: {
    // TL corner, 5th cell along top = col5. Zone sits below row0, right edge at col5 right.
    left: 6 * STEP - GAP - START_ZONE_SIZE,
    top: 1 * STEP,
    bg: "#FAECE7",
    border: "#D85A30",
    textColor: "#993C1D",
    labelTransform: "scaleX(-1)",
    labelOrigin: "top right",
    labelPos: { top: "5px", right: "5px" },
  },
  blue: {
    // TR corner, 5th cell along right = row5. Zone sits left of col15, top at row1.
    left: 15 * STEP - START_ZONE_SIZE,
    top: 1 * STEP,
    bg: "#E6F1FB",
    border: "#378ADD",
    textColor: "#185FA5",
    labelTransform: "rotate(90deg) scaleX(-1)",
    labelOrigin: "top right",
    labelPos: { top: "5px", right: "5px" },
  },
  yellow: {
    // BR corner, 5th cell along bottom = col10. Zone sits above row15, left at col10.
    left: 10 * STEP,
    top: 15 * STEP - START_ZONE_SIZE,
    bg: "#FAEEDA",
    border: "#EF9F27",
    textColor: "#854F0B",
    labelTransform: "rotate(180deg) scaleX(-1)",
    labelOrigin: "bottom left",
    labelPos: { bottom: "5px", left: "5px" },
  },
  green: {
    // BL corner, 5th cell along left = row10. Zone sits right of col0, bottom at row10 bottom.
    left: 1 * STEP,
    top: 10 * STEP - START_ZONE_SIZE,
    bg: "#EAF3DE",
    border: "#639922",
    textColor: "#3B6D11",
    labelTransform: "rotate(-90deg) scaleX(-1)",
    labelOrigin: "bottom left",
    labelPos: { bottom: "5px", left: "5px" },
  },
};

function buildBoardGrid(): (number | null)[][] {
  const grid: (number | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from<number | null>({ length: BOARD_SIZE }).fill(null),
  );
  for (let i = 0; i < 14; i++) {
    const r0 = grid[0];
    const ri = grid[i + 1];
    const r15 = grid[15];
    const rl = grid[14 - i];
    if (r0 !== undefined) r0[i + 1] = i + 1;
    if (ri !== undefined) ri[15] = 15 + i;
    if (r15 !== undefined) r15[14 - i] = 29 + i;
    if (rl !== undefined) rl[0] = 43 + i;
  }
  const firstRow = grid[0];
  const lastRow = grid[15];
  if (firstRow !== undefined) {
    firstRow[0] = 57;
    firstRow[15] = 58;
  }
  if (lastRow !== undefined) {
    lastRow[15] = 59;
    lastRow[0] = 60;
  }
  return grid;
}

function makePawnDot(pawn: Pawn, size: number, fontSize: number): HTMLDivElement {
  const dot = document.createElement("div");
  dot.style.cssText = `
    width:${String(size)}px; height:${String(size)}px; border-radius:50%;
    background:${pawnColor(pawn.color)};
    border:1px solid rgba(0,0,0,0.2);
    display:flex; align-items:center; justify-content:center;
    font-size:${String(fontSize)}px; color:white; font-weight:500; line-height:1;
  `;
  dot.textContent = String(pawn.pawn_number);
  return dot;
}

// Sequential grid positions that are safe zone entries (one per color)
const SAFE_ZONE_SEQUENTIAL = new Set([5, 19, 34, 48]);

function buildBoardCells(grid: (number | null)[][], pawnsByCell: Map<string, Pawn[]>): HTMLElement {
  const board = document.createElement("div");
  board.style.cssText = `
    display: grid;
    grid-template-columns: repeat(${String(BOARD_SIZE)}, ${String(CELL)}px);
    grid-template-rows: repeat(${String(BOARD_SIZE)}, ${String(CELL)}px);
    gap: ${String(GAP)}px;
    position: relative;
    width: fit-content;
    margin: 0 auto;
  `;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div");
      const pos = grid[r]?.[c] ?? null;
      if (pos !== null) {
        const isSafe = SAFE_ZONE_SEQUENTIAL.has(pos);
        const bg = isSafe ? "#d1fae5" : "#ffffff";
        const border = isSafe ? "#6ee7b7" : "#cccccc";
        cell.style.cssText = `
          width:${String(CELL)}px; height:${String(CELL)}px; border-radius:3px;
          background:${bg}; border:1px solid ${border};
          display:flex; align-items:center; justify-content:center;
          flex-wrap:wrap; gap:1px;
          font-size:7px; font-weight:500; color:#999999; position:relative;
        `;
        if (isSafe) cell.title = "Safe zone — your pawn cannot be bumped here";
        const pawnsHere = pawnsByCell.get(`${String(r)},${String(c)}`) ?? [];
        for (const pawn of pawnsHere) {
          const dot = makePawnDot(pawn, 10, 6);
          dot.title = `${pawn.username} pawn ${String(pawn.pawn_number)}${isSafe ? " (safe)" : ""}`;
          cell.appendChild(dot);
        }
        if (pawnsHere.length === 0) {
          cell.textContent = isSafe ? "SAFE" : String(pos);
        }
      } else {
        cell.style.cssText = `width:${String(CELL)}px; height:${String(CELL)}px; background:transparent;`;
      }
      board.appendChild(cell);
    }
  }
  return board;
}

function addStartZones(board: HTMLElement, startZonePawns: Map<string, Pawn[]>): void {
  for (const [colorName, cfg] of Object.entries(START_ZONES)) {
    const zone = document.createElement("div");
    zone.style.cssText = `
      position:absolute;
      left:${String(cfg.left)}px; top:${String(cfg.top)}px;
      width:${String(START_ZONE_SIZE)}px; height:${String(START_ZONE_SIZE)}px;
      background:${cfg.bg}; border:1px solid ${cfg.border};
      border-radius:5px;
      display:flex; flex-wrap:wrap; align-items:center; justify-content:center;
      gap:3px; padding:6px;
    `;
    const label = document.createElement("span");
    label.textContent = "START";
    label.style.cssText = `
      position:absolute; bottom:4px; left:0; right:0;
      text-align:center;
      font-size:8px; font-weight:600; letter-spacing:1.5px;
      color:${cfg.textColor}; white-space:nowrap;
    `;
    zone.appendChild(label);
    for (const pawn of startZonePawns.get(colorName) ?? []) {
      const dot = makePawnDot(pawn, 12, 7);
      dot.title = `${pawn.username} pawn ${String(pawn.pawn_number)} (start)`;
      zone.appendChild(dot);
    }
    board.appendChild(zone);
  }
}

function renderBoard(container: HTMLElement, state: GameState): void {
  const section = document.createElement("section");
  section.className = "panel-section";

  const wrap = document.createElement("div");
  wrap.style.cssText = "overflow-x:auto;";

  const pawnsByCell = new Map<string, Pawn[]>();
  const startZonePawns = new Map<string, Pawn[]>();

  for (const pawn of state.pawns) {
    if (pawn.is_start) {
      const arr = startZonePawns.get(pawn.color) ?? [];
      arr.push(pawn);
      startZonePawns.set(pawn.color, arr);
      continue;
    }
    if (pawn.is_home) continue;
    const cell = DB_POS_TO_CELL[pawn.position];
    if (cell === undefined) continue;
    const key = `${String(cell[0])},${String(cell[1])}`;
    const arr = pawnsByCell.get(key) ?? [];
    arr.push(pawn);
    pawnsByCell.set(key, arr);
  }

  const board = buildBoardCells(buildBoardGrid(), pawnsByCell);
  addStartZones(board, startZonePawns);

  wrap.appendChild(board);
  section.appendChild(wrap);
  container.appendChild(section);
}

function pawnColor(color: string): string {
  const map: Record<string, string> = {
    red: "#D85A30",
    blue: "#378ADD",
    yellow: "#EF9F27",
    green: "#639922",
  };
  return map[color] ?? "#888";
}

// ─── Other render functions ───────────────────────────────────────────────────

function renderGameList(): void {
  const list = getElement("game-list");
  if (list === null) return;

  clearElement(list);

  if (store.games.length === 0) {
    appendText(list, "p", "No games yet. Create one to get started.");
    return;
  }

  for (const game of store.games) {
    const item = document.createElement("article");
    item.className = "game-card";

    const info = document.createElement("div");
    info.className = "game-card-info";
    appendText(info, "h4", `Game #${String(game.id)}`);
    appendText(info, "p", `${game.status} · ${String(game.player_count)} player(s)`);
    item.appendChild(info);

    const button = makeButton("View", () => void loadGameState(game.id));
    item.appendChild(button);
    list.appendChild(item);
  }
}

function renderPlayers(container: HTMLElement, state: GameState): void {
  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Players");

  if (state.players.length === 0) {
    appendText(section, "p", "No players have joined yet.");
    container.appendChild(section);
    return;
  }

  const list = document.createElement("div");
  list.className = "players-list";

  for (const player of state.players) {
    const item = document.createElement("div");
    item.className = "player-item";

    const isCurrentTurn = player.turn_order === state.game.current_turn;
    if (isCurrentTurn) {
      item.className += " player-item--current-turn";
      item.style.backgroundColor = "rgba(255, 193, 7, 0.1)";
      item.style.border = "2px solid #ffc107";
      item.style.borderRadius = "4px";
    }

    const dot = document.createElement("span");
    dot.className = `player-dot player-dot--${player.color}`;
    item.appendChild(dot);
    const nameSpan = appendText(item, "span", player.username);
    if (isCurrentTurn) nameSpan.style.fontWeight = "bold";

    const homePawns = state.pawns.filter((p) => p.player_id === player.id && p.is_home).length;
    if (homePawns > 0) {
      const homeTag = appendText(item, "span", `${String(homePawns)}/4 home`);
      homeTag.style.cssText = "margin-left:auto; font-size:0.7rem; color:#16a34a; font-weight:600;";
    }

    list.appendChild(item);
  }

  section.appendChild(list);
  container.appendChild(section);
}

function renderPendingCard(container: HTMLElement, state: GameState): void {
  if (state.pendingCard === null) return;

  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const isMyTurn = myPlayer !== undefined && myPlayer.turn_order === state.game.current_turn;
  const activePlayer = state.players.find((p) => p.turn_order === state.game.current_turn);

  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(
    section,
    "h4",
    isMyTurn ? "Your drawn card" : `${activePlayer?.username ?? "Opponent"}'s drawn card`,
  );

  const card = document.createElement("div");
  card.className = "drawn-card";
  appendText(card, "div", state.pendingCard.value).className = "card-value";
  appendText(card, "p", state.pendingCard.description).className = "card-desc";

  section.appendChild(card);
  container.appendChild(section);
}

function renderValidMoves(container: HTMLElement, state: GameState): void {
  if (state.pendingCard === null) return;

  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const isMyTurn = myPlayer !== undefined && myPlayer.turn_order === state.game.current_turn;

  if (!isMyTurn) {
    const section = document.createElement("section");
    section.className = "panel-section";
    const activePlayer = state.players.find((p) => p.turn_order === state.game.current_turn);
    appendText(section, "p", `Waiting for ${activePlayer?.username ?? "opponent"} to move...`);
    container.appendChild(section);
    return;
  }

  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Valid moves");

  if (state.validMoves.length === 0) {
    appendText(section, "p", "No valid moves.");
    const btn = makeButton(
      "Forfeit Turn",
      () => void postAction("forfeit-turn", "Turn forfeited."),
    );
    btn.className = "btn-action btn-forfeit";
    section.appendChild(btn);
    container.appendChild(section);
    return;
  }

  const list = document.createElement("div");
  list.className = "moves-list";

  for (const move of state.validMoves) {
    const btn = makeButton(move.label, () => void playMove(move));
    btn.className = "move-btn";
    list.appendChild(btn);
  }

  section.appendChild(list);
  container.appendChild(section);
}

function renderDiscard(container: HTMLElement, state: GameState): void {
  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Recent cards played");

  if (state.discard.length === 0) {
    appendText(section, "p", "No cards have been played yet.");
    container.appendChild(section);
    return;
  }

  const list = document.createElement("div");
  list.className = "discard-list";

  for (const card of state.discard) {
    appendText(
      list,
      "div",
      `${card.username} played ${card.value}: ${card.description}`,
    ).className = "discard-item";
  }

  section.appendChild(list);
  container.appendChild(section);
}

function renderActions(container: HTMLElement, state: GameState): void {
  const actions = document.createElement("div");
  actions.className = "actions-row";

  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const isMyTurn = myPlayer !== undefined && myPlayer.turn_order === state.game.current_turn;

  if (state.game.status === "waiting") {
    const b = makeButton("Join Game", () => void postAction("join", "Joined game."));
    b.className = "btn-action btn-join";
    actions.appendChild(b);
  }

  if (state.game.status === "waiting" && state.players.length >= 2) {
    const b = makeButton("Start Game", () => void postAction("start", "Game started."));
    b.className = "btn-action btn-start";
    actions.appendChild(b);
  }

  if (state.game.status === "active" && state.pendingCard === null && isMyTurn) {
    const b = makeButton("Draw Card", () => void postAction("draw-card", "Card drawn."));
    b.className = "btn-action btn-draw";
    actions.appendChild(b);
  }

  if (state.game.status === "active" && myPlayer !== undefined && !isMyTurn) {
    const activePlayer = state.players.find((p) => p.turn_order === state.game.current_turn);
    const skipLabel = `Skip ${activePlayer?.username ?? "player"}'s turn (disconnected?)`;
    const b = makeButton(skipLabel, () => void postAction("skip-turn", "Turn skipped."));
    b.className = "btn-action btn-forfeit";
    b.title = "Use this if the current player has disconnected and the game is stuck.";
    actions.appendChild(b);
  }

  if (actions.childElementCount > 0) {
    container.appendChild(actions);
  }
}

function renderSelectedGame(): void {
  const detail = getElement("game-detail");
  if (detail === null) return;

  clearElement(detail);

  if (store.gameState === null) {
    appendText(detail, "div", "Select or create a game to get started.").className =
      "game-detail-empty";
    return;
  }

  const state = store.gameState;

  const header = document.createElement("div");
  header.className = "game-header";
  appendText(header, "h3", `Game #${String(state.game.id)}`).className = "game-title";
  const meta = document.createElement("div");
  meta.className = "game-meta";
  appendText(meta, "span", state.game.status).className =
    `status-badge status-badge--${state.game.status}`;
  appendText(meta, "span", `${String(state.deckRemaining)} cards left`);
  header.appendChild(meta);
  detail.appendChild(header);

  if (state.game.winner_id !== null) {
    const winner = state.players.find((p) => p.user_id === state.game.winner_id);
    const name = winner !== undefined ? winner.username : "Unknown";
    appendText(detail, "div", `${name} wins!`).className = "winner-banner";
  }

  renderPlayers(detail, state);
  renderActions(detail, state);
  renderBoard(detail, state);
  renderPendingCard(detail, state);
  renderValidMoves(detail, state);
  renderDiscard(detail, state);
}

function render(): void {
  const status = getElement("sse-status");
  const message = getElement("lobby-message");

  if (status !== null) {
    status.textContent = store.connectionStatus;
    status.className = `sse-status sse-status--${store.connectionStatus}`;
  }

  if (message !== null) {
    message.textContent = store.message;
  }

  renderGameList();
  renderSelectedGame();
}

const createButton = document.getElementById("create-game-btn");
if (createButton instanceof HTMLButtonElement) {
  createButton.addEventListener("click", () => void createGame());
}

connectSSE();
void loadGames().then(() => {
  const stored = sessionStorage.getItem("selectedGameId");
  if (stored !== null) {
    const id = Number(stored);
    if (Number.isInteger(id) && id > 0) {
      void loadGameState(id).catch(() => {
        sessionStorage.removeItem("selectedGameId");
      });
    }
  }
});

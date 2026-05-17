// src/client/lobby.ts
var store = {
  connectionStatus: "disconnected",
  games: [],
  selectedGameId: null,
  gameState: null,
  message: ""
};
function updateStore(patch) {
  Object.assign(store, patch);
  render();
}
function getElement(id) {
  return document.getElementById(id);
}
function clearElement(element) {
  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
}
function appendText(parent, tagName, text) {
  const element = document.createElement(tagName);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}
function makeButton(text, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}
function showToast(message, duration = 3e3) {
  const toastContainer = document.getElementById("toast-container");
  if (toastContainer === null) {
    const container2 = document.createElement("div");
    container2.id = "toast-container";
    container2.style.position = "fixed";
    container2.style.top = "20px";
    container2.style.right = "20px";
    container2.style.zIndex = "9999";
    document.body.appendChild(container2);
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
async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return await response.json();
}
async function loadGames() {
  const games = await fetchJson("/games");
  updateStore({ games });
}
async function loadGameState(gameId) {
  const gameState = await fetchJson(`/games/${String(gameId)}`);
  updateStore({ selectedGameId: gameId, gameState });
}
async function createGame() {
  try {
    const game = await fetchJson("/games", { method: "POST" });
    updateStore({ selectedGameId: game.id, message: `Created game #${String(game.id)}.` });
    await loadGames();
    await loadGameState(game.id);
  } catch (err) {
    updateStore({ message: err instanceof Error ? err.message : "Could not create game." });
  }
}
async function postAction(path, successMessage, body) {
  const gameId = store.selectedGameId;
  if (gameId === null) return;
  try {
    await fetchJson(`/games/${String(gameId)}/${path}`, {
      method: "POST",
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
    showToast(successMessage);
    await loadGames();
    await loadGameState(gameId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Action failed.";
    showToast(errorMessage);
  }
}
async function playMove(move) {
  const body = { pawnId: move.pawnId, action: move.action };
  if (move.targetPawnId !== void 0) body.targetPawnId = move.targetPawnId;
  if (move.pawnId2 !== void 0) body.pawnId2 = move.pawnId2;
  if (move.steps1 !== void 0) body.steps1 = move.steps1;
  await postAction("move-pawn", "Move made.", body);
}
function connectSSE() {
  const eventSource = new EventSource("/api/sse");
  eventSource.addEventListener("open", () => {
    updateStore({ connectionStatus: "connected" });
  });
  eventSource.addEventListener("error", () => {
    updateStore({ connectionStatus: "reconnecting" });
  });
  eventSource.addEventListener("message", (event) => {
    void handleSseMessage(String(event.data));
  });
}
async function handleSseMessage(rawData) {
  const payload = JSON.parse(rawData);
  if (payload.type === "gamesChanged") {
    await loadGames();
  }
  if (payload.type === "gameStateChanged" && payload.gameId === store.selectedGameId) {
    await loadGameState(payload.gameId);
  }
  if (payload.type === "bump" && payload.bump !== void 0) {
    const bump = payload.bump;
    showToast(
      `${bump.bumperUsername} bumped ${bump.bumpedUsername}'s pawn ${bump.pawnNumber} back to start!`,
      4e3
    );
  }
}
var BOARD_SIZE = 16;
var CELL = 32;
var GAP = 2;
var STEP = CELL + GAP;
var START_ZONE_SIZE = CELL * 2 + GAP;
var POSITION_TO_CELL = {};
for (let i = 0; i < 14; i++) POSITION_TO_CELL[i + 1] = [0, i + 1];
for (let i = 0; i < 14; i++) POSITION_TO_CELL[15 + i] = [i + 1, 15];
for (let i = 0; i < 14; i++) POSITION_TO_CELL[29 + i] = [15, 14 - i];
for (let i = 0; i < 14; i++) POSITION_TO_CELL[43 + i] = [14 - i, 0];
POSITION_TO_CELL[57] = [0, 0];
POSITION_TO_CELL[58] = [0, 15];
POSITION_TO_CELL[59] = [15, 15];
POSITION_TO_CELL[60] = [15, 0];
var DB_POS_TO_CELL = {
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
  59: [1, 0]
};
var START_ZONES = {
  red: {
    // TL corner, 5th cell along top = col5. Zone sits below row0, right edge at col5 right.
    left: 6 * STEP - GAP - START_ZONE_SIZE,
    top: 1 * STEP,
    bg: "#FAECE7",
    border: "#D85A30",
    textColor: "#993C1D",
    labelTransform: "scaleX(-1)",
    labelOrigin: "top right",
    labelPos: { top: "5px", right: "5px" }
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
    labelPos: { top: "5px", right: "5px" }
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
    labelPos: { bottom: "5px", left: "5px" }
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
    labelPos: { bottom: "5px", left: "5px" }
  }
};
function renderBoard(container, state) {
  const section = document.createElement("section");
  section.className = "panel-section";
  const wrap = document.createElement("div");
  wrap.style.cssText = "overflow-x:auto;";
  const grid = Array.from(
    { length: BOARD_SIZE },
    () => Array(BOARD_SIZE).fill(null)
  );
  for (let i = 0; i < 14; i++) grid[0][i + 1] = i + 1;
  for (let i = 0; i < 14; i++) grid[i + 1][15] = 15 + i;
  for (let i = 0; i < 14; i++) grid[15][14 - i] = 29 + i;
  for (let i = 0; i < 14; i++) grid[14 - i][0] = 43 + i;
  grid[0][0] = 57;
  grid[0][15] = 58;
  grid[15][15] = 59;
  grid[15][0] = 60;
  const pawnsByCell = /* @__PURE__ */ new Map();
  for (const pawn of state.pawns) {
    if (pawn.is_start || pawn.is_home) continue;
    const cell = DB_POS_TO_CELL[pawn.position];
    if (cell === void 0) continue;
    const key = `${cell[0]},${cell[1]}`;
    const arr = pawnsByCell.get(key) ?? [];
    arr.push(pawn);
    pawnsByCell.set(key, arr);
  }
  const startZonePawns = /* @__PURE__ */ new Map();
  const homePawns = /* @__PURE__ */ new Map();
  for (const pawn of state.pawns) {
    if (pawn.is_start) {
      const arr = startZonePawns.get(pawn.color) ?? [];
      arr.push(pawn);
      startZonePawns.set(pawn.color, arr);
    }
    if (pawn.is_home) {
      const arr = homePawns.get(pawn.color) ?? [];
      arr.push(pawn);
      homePawns.set(pawn.color, arr);
    }
  }
  const board = document.createElement("div");
  board.style.cssText = `
    display: grid;
    grid-template-columns: repeat(${BOARD_SIZE}, ${CELL}px);
    grid-template-rows: repeat(${BOARD_SIZE}, ${CELL}px);
    gap: ${GAP}px;
    position: relative;
    width: fit-content;
    margin: 0 auto;
  `;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div");
      const pos = grid[r]?.[c] ?? null;
      if (pos !== null) {
        cell.style.cssText = `
          width:${CELL}px; height:${CELL}px; border-radius:3px;
          background:#ffffff;
          border:1px solid #cccccc;
          display:flex; align-items:center; justify-content:center;
          flex-wrap:wrap; gap:1px;
          font-size:7px; font-weight:500; color:#999999;
          position:relative;
        `;
        const key = `${r},${c}`;
        const pawnsHere = pawnsByCell.get(key) ?? [];
        if (pawnsHere.length > 0) {
          for (const pawn of pawnsHere) {
            const dot = document.createElement("div");
            dot.style.cssText = `
              width:10px; height:10px; border-radius:50%;
              background:${pawnColor(pawn.color)};
              border:1px solid rgba(0,0,0,0.2);
              display:flex; align-items:center; justify-content:center;
              font-size:6px; color:white; font-weight:500; line-height:1;
            `;
            dot.textContent = String(pawn.pawn_number);
            dot.title = `${pawn.username} pawn ${pawn.pawn_number}`;
            cell.appendChild(dot);
          }
        } else {
          cell.textContent = String(pos);
        }
      } else {
        cell.style.cssText = `width:${CELL}px; height:${CELL}px; background:transparent;`;
      }
      board.appendChild(cell);
    }
  }
  for (const [colorName, cfg] of Object.entries(START_ZONES)) {
    const zone = document.createElement("div");
    zone.style.cssText = `
      position:absolute;
      left:${cfg.left}px; top:${cfg.top}px;
      width:${START_ZONE_SIZE}px; height:${START_ZONE_SIZE}px;
      background:${cfg.bg}; border:1px solid ${cfg.border};
      border-radius:5px;
      display:flex; flex-wrap:wrap; align-items:center; justify-content:center;
      gap:3px; padding:6px;
    `;
    const label = document.createElement("span");
    label.textContent = "START";
    label.style.cssText = `
      position:absolute;
      bottom:4px; left:0; right:0;
      text-align:center;
      font-size:8px; font-weight:600; letter-spacing:1.5px;
      color:${cfg.textColor}; white-space:nowrap;
`;
    zone.appendChild(label);
    const pawnsHere = startZonePawns.get(colorName) ?? [];
    for (const pawn of pawnsHere) {
      const dot = document.createElement("div");
      dot.style.cssText = `
        width:12px; height:12px; border-radius:50%;
        background:${pawnColor(pawn.color)};
        border:1px solid rgba(0,0,0,0.2);
        display:flex; align-items:center; justify-content:center;
        font-size:7px; color:white; font-weight:500;
      `;
      dot.textContent = String(pawn.pawn_number);
      dot.title = `${pawn.username} pawn ${pawn.pawn_number} (start)`;
      zone.appendChild(dot);
    }
    board.appendChild(zone);
  }
  wrap.appendChild(board);
  section.appendChild(wrap);
  container.appendChild(section);
}
function pawnColor(color) {
  const map = {
    red: "#D85A30",
    blue: "#378ADD",
    yellow: "#EF9F27",
    green: "#639922"
  };
  return map[color] ?? "#888";
}
function renderGameList() {
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
    appendText(info, "p", `${game.status} \xB7 ${String(game.player_count)} player(s)`);
    item.appendChild(info);
    const button = makeButton("View", () => void loadGameState(game.id));
    item.appendChild(button);
    list.appendChild(item);
  }
}
function renderPlayers(container, state) {
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
    if (Number(player.turn_order) === Number(state.game.current_turn)) {
      item.className += " player-item--current-turn";
      item.style.backgroundColor = "rgba(255, 193, 7, 0.1)";
      item.style.border = "2px solid #ffc107";
      item.style.borderRadius = "4px";
    }
    const dot = document.createElement("span");
    dot.className = `player-dot player-dot--${player.color}`;
    item.appendChild(dot);
    const nameSpan = appendText(item, "span", player.username);
    if (Number(player.turn_order) === Number(state.game.current_turn)) {
      nameSpan.style.fontWeight = "bold";
    }
    list.appendChild(item);
  }
  section.appendChild(list);
  container.appendChild(section);
}
function renderPendingCard(container, state) {
  if (state.pendingCard === null) return;
  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const isMyTurn = myPlayer !== void 0 && Number(myPlayer.turn_order) === Number(state.game.current_turn);
  const activePlayer = state.players.find(
    (p) => Number(p.turn_order) === Number(state.game.current_turn)
  );
  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(
    section,
    "h4",
    isMyTurn ? "Your drawn card" : `${activePlayer?.username ?? "Opponent"}'s drawn card`
  );
  const card = document.createElement("div");
  card.className = "drawn-card";
  appendText(card, "div", state.pendingCard.value).className = "card-value";
  appendText(card, "p", state.pendingCard.description).className = "card-desc";
  section.appendChild(card);
  container.appendChild(section);
}
function renderValidMoves(container, state) {
  if (state.pendingCard === null) return;
  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const isMyTurn = myPlayer !== void 0 && Number(myPlayer.turn_order) === Number(state.game.current_turn);
  if (!isMyTurn) {
    const section2 = document.createElement("section");
    section2.className = "panel-section";
    const activePlayer = state.players.find(
      (p) => Number(p.turn_order) === Number(state.game.current_turn)
    );
    appendText(
      section2,
      "p",
      `Waiting for ${activePlayer?.username ?? "opponent"} to move...`
    );
    container.appendChild(section2);
    return;
  }
  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Valid moves");
  if (state.validMoves.length === 0) {
    appendText(section, "p", "No valid moves.");
    const btn = makeButton(
      "Forfeit Turn",
      () => void postAction("forfeit-turn", "Turn forfeited.")
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
function renderDiscard(container, state) {
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
      `${card.username} played ${card.value}: ${card.description}`
    ).className = "discard-item";
  }
  section.appendChild(list);
  container.appendChild(section);
}
function renderActions(container, state) {
  const actions = document.createElement("div");
  actions.className = "actions-row";
  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const isMyTurn = myPlayer !== void 0 && Number(myPlayer.turn_order) === Number(state.game.current_turn);
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
  if (actions.childElementCount > 0) {
    container.appendChild(actions);
  }
}
function renderSelectedGame() {
  const detail = getElement("game-detail");
  if (detail === null) return;
  clearElement(detail);
  if (store.gameState === null) {
    appendText(detail, "div", "Select or create a game to get started.").className = "game-detail-empty";
    return;
  }
  const state = store.gameState;
  const header = document.createElement("div");
  header.className = "game-header";
  appendText(header, "h3", `Game #${String(state.game.id)}`).className = "game-title";
  const meta = document.createElement("div");
  meta.className = "game-meta";
  appendText(meta, "span", state.game.status).className = `status-badge status-badge--${state.game.status}`;
  appendText(meta, "span", `${String(state.deckRemaining)} cards left`);
  header.appendChild(meta);
  detail.appendChild(header);
  if (state.game.winner_id !== null) {
    const winner = state.players.find((p) => p.id === state.game.winner_id);
    const name = winner !== void 0 ? winner.username : "Unknown";
    appendText(detail, "div", `${name} wins!`).className = "winner-banner";
  }
  renderPlayers(detail, state);
  renderActions(detail, state);
  renderBoard(detail, state);
  renderPendingCard(detail, state);
  renderValidMoves(detail, state);
  renderDiscard(detail, state);
}
function render() {
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
var createButton = document.getElementById("create-game-btn");
if (createButton instanceof HTMLButtonElement) {
  createButton.addEventListener("click", () => void createGame());
}
connectSSE();
void loadGames();
//# sourceMappingURL=lobby.js.map

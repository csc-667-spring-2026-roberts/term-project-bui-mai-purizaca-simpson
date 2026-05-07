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
  const game = await fetchJson("/games", { method: "POST" });
  updateStore({
    selectedGameId: game.id,
    message: `Created game #${String(game.id)}.`
  });
  await loadGames();
  await loadGameState(game.id);
}
async function postAction(path, successMessage, body) {
  const gameId = store.selectedGameId;
  if (gameId === null) return;
  await fetchJson(`/games/${String(gameId)}/${path}`, {
    method: "POST",
    body: body !== void 0 ? JSON.stringify(body) : void 0
  });
  updateStore({ message: successMessage });
  await loadGames();
  await loadGameState(gameId);
}
async function playMove(move) {
  const body = {
    pawnId: move.pawnId,
    targetPosition: move.targetPosition
  };
  if (move.splitPawnId !== void 0) {
    body.splitPawnId = move.splitPawnId;
  }
  if (move.splitTargetPosition !== void 0) {
    body.splitTargetPosition = move.splitTargetPosition;
  }
  await postAction("move-pawn", `Moved pawn ${String(move.pawnNumber)}.`, body);
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
    const dot = document.createElement("span");
    dot.className = `player-dot player-dot--${player.color}`;
    item.appendChild(dot);
    appendText(item, "span", player.username);
    list.appendChild(item);
  }
  section.appendChild(list);
  container.appendChild(section);
}
function pawnPositionLabel(pawn) {
  if (pawn.is_home) return "Home";
  if (pawn.is_start) return "Start";
  return `Position ${String(pawn.position)}`;
}
function renderPawns(container, state) {
  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Pawns");
  if (state.pawns.length === 0) {
    appendText(section, "p", "No pawns yet.");
    container.appendChild(section);
    return;
  }
  const byPlayer = /* @__PURE__ */ new Map();
  for (const pawn of state.pawns) {
    const arr = byPlayer.get(pawn.player_id) ?? [];
    arr.push(pawn);
    byPlayer.set(pawn.player_id, arr);
  }
  for (const pawns of byPlayer.values()) {
    const row = document.createElement("div");
    row.className = "pawn-row";
    appendText(row, "span", pawns[0]?.username ?? "").className = "pawn-player-name";
    for (const pawn of pawns) {
      const dot = document.createElement("div");
      dot.className = `pawn-dot pawn-dot--${pawn.color}`;
      if (pawn.is_home) dot.classList.add("is-home");
      if (pawn.is_start) dot.classList.add("is-start");
      dot.textContent = String(pawn.pawn_number);
      dot.title = pawnPositionLabel(pawn);
      row.appendChild(dot);
    }
    section.appendChild(row);
  }
  container.appendChild(section);
}
function renderPendingCard(container, state) {
  if (state.pendingCard === null) return;
  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Drawn Card");
  const card = document.createElement("div");
  card.className = "drawn-card";
  appendText(card, "div", state.pendingCard.value).className = "card-value";
  appendText(card, "p", state.pendingCard.description).className = "card-desc";
  section.appendChild(card);
  container.appendChild(section);
}
function renderValidMoves(container, state) {
  if (state.pendingCard === null) return;
  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Valid Moves");
  if (state.validMoves.length === 0) {
    appendText(section, "p", "No valid moves.");
    const btn = makeButton("Forfeit Turn", () => void postAction("forfeit-turn", "Turn forfeited."));
    btn.className = "btn-action btn-forfeit";
    section.appendChild(btn);
    container.appendChild(section);
    return;
  }
  const list = document.createElement("div");
  list.className = "moves-list";
  for (const move of state.validMoves) {
    const btn = makeButton(move.description, () => void playMove(move));
    btn.className = "move-btn";
    list.appendChild(btn);
  }
  section.appendChild(list);
  container.appendChild(section);
}
function renderDiscard(container, state) {
  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Recent Cards Played");
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
  if (state.game.status === "active" && state.pendingCard === null) {
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
  renderPawns(detail, state);
  renderActions(detail, state);
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

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
    appendText(list, "p", "No games yet. Create one to start the demo.");
    return;
  }
  for (const game of store.games) {
    const item = document.createElement("article");
    item.className = "game-card";
    appendText(item, "h4", `Game #${String(game.id)} \u2014 ${game.status}`);
    appendText(item, "p", `${String(game.player_count)} player(s)`);
    const button = makeButton("View Game", () => void loadGameState(game.id));
    item.appendChild(button);
    list.appendChild(item);
  }
}
function renderPlayers(container, state) {
  const section = appendText(container, "section", "");
  appendText(section, "h4", "Players");
  if (state.players.length === 0) {
    appendText(section, "p", "No players have joined yet.");
    return;
  }
  for (const player of state.players) {
    appendText(section, "p", `${player.color}: ${player.username}`);
  }
}
function pawnPositionLabel(pawn) {
  if (pawn.is_home) return "Home";
  if (pawn.is_start) return "Start";
  return `Position ${String(pawn.position)}`;
}
function renderPawns(container, state) {
  const section = appendText(container, "section", "");
  appendText(section, "h4", "Pawns");
  if (state.pawns.length === 0) {
    appendText(section, "p", "No pawns yet.");
    return;
  }
  for (const pawn of state.pawns) {
    const label = `${pawn.color} Pawn ${String(pawn.pawn_number)} (${pawn.username}): ${pawnPositionLabel(pawn)}`;
    appendText(section, "p", label);
  }
}
function renderPendingCard(container, state) {
  if (state.pendingCard === null) return;
  const section = appendText(container, "section", "");
  appendText(section, "h4", "Drawn Card");
  appendText(
    section,
    "p",
    `Card ${state.pendingCard.value}: ${state.pendingCard.description}`
  );
}
function renderValidMoves(container, state) {
  if (state.pendingCard === null) return;
  const section = appendText(container, "section", "");
  appendText(section, "h4", "Valid Moves");
  if (state.validMoves.length === 0) {
    appendText(section, "p", "No valid moves \u2014 use Forfeit Turn.");
    container.appendChild(
      makeButton("Forfeit Turn", () => void postAction("forfeit-turn", "Turn forfeited."))
    );
    return;
  }
  for (const move of state.validMoves) {
    const btn = makeButton(move.description, () => void playMove(move));
    section.appendChild(btn);
  }
}
function renderDiscard(container, state) {
  const section = appendText(container, "section", "");
  appendText(section, "h4", "Recent cards played");
  if (state.discard.length === 0) {
    appendText(section, "p", "No cards have been played yet.");
    return;
  }
  for (const card of state.discard) {
    appendText(section, "p", `${card.username} played ${card.value}: ${card.description}`);
  }
}
function renderSelectedGame() {
  const detail = getElement("game-detail");
  if (detail === null) return;
  clearElement(detail);
  if (store.gameState === null) {
    appendText(detail, "p", "Create or view a game to get started.");
    return;
  }
  const state = store.gameState;
  appendText(detail, "h3", `Game #${String(state.game.id)}`);
  appendText(detail, "p", `Status: ${state.game.status}`);
  appendText(detail, "p", `Deck remaining: ${String(state.deckRemaining)}`);
  if (state.game.winner_id !== null) {
    const winner = state.players.find((p) => p.id === state.game.winner_id);
    const name = winner !== void 0 ? winner.username : "Unknown";
    appendText(detail, "h3", `Winner: ${name}!`);
  }
  renderPlayers(detail, state);
  renderPawns(detail, state);
  if (state.game.status === "waiting") {
    detail.appendChild(
      makeButton("Join Game", () => void postAction("join", "Joined game."))
    );
  }
  if (state.game.status === "waiting" && state.players.length >= 2) {
    detail.appendChild(
      makeButton("Start Game", () => void postAction("start", "Game started."))
    );
  }
  if (state.game.status === "active" && state.pendingCard === null) {
    detail.appendChild(
      makeButton("Draw Card", () => void postAction("draw-card", "Card drawn."))
    );
  }
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

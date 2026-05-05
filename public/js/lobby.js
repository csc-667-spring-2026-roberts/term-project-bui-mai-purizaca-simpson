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
async function postGameAction(path, successMessage) {
  if (store.selectedGameId === null) return;
  await fetchJson(`/games/${String(store.selectedGameId)}/${path}`, {
    method: "POST"
  });
  updateStore({ message: successMessage });
  await loadGames();
  await loadGameState(store.selectedGameId);
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
    void handleSseMessage(event.data);
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
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "View Game";
    button.addEventListener("click", () => void loadGameState(game.id));
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
function renderDiscard(container, state) {
  const section = appendText(container, "section", "");
  appendText(section, "h4", "Recent cards played");
  if (state.discard.length === 0) {
    appendText(section, "p", "No cards have been played yet.");
    return;
  }
  for (const card of state.discard) {
    appendText(
      section,
      "p",
      `${card.username} drew ${card.value}: ${card.description}`
    );
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
  renderPlayers(detail, state);
  const joinButton = document.createElement("button");
  joinButton.type = "button";
  joinButton.textContent = "Join Game";
  joinButton.addEventListener(
    "click",
    () => void postGameAction("join", "Joined game.")
  );
  detail.appendChild(joinButton);
  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.textContent = "Start Game";
  startButton.addEventListener(
    "click",
    () => void postGameAction("start", "Game started.")
  );
  detail.appendChild(startButton);
  const drawButton = document.createElement("button");
  drawButton.type = "button";
  drawButton.textContent = "Draw / Play Card";
  drawButton.addEventListener(
    "click",
    () => void postGameAction("draw-card", "Card played.")
  );
  detail.appendChild(drawButton);
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

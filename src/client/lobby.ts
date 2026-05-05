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

type Discard = {
  id: number;
  username: string;
  color: string;
  value: string;
  description: string;
  created_at: string;
};

type GameState = {
  game: { id: number; status: string; current_turn: number };
  players: Player[];
  deckRemaining: number;
  discard: Discard[];
  myPlayerId: number | null;
};

type SsePayload = {
  type?: string;
  gameId?: number;
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
  updateStore({ selectedGameId: gameId, gameState });
}

async function createGame(): Promise<void> {
  const game = await fetchJson<{ id: number }>("/games", { method: "POST" });
  updateStore({
    selectedGameId: game.id,
    message: `Created game #${String(game.id)}.`,
  });
  await loadGames();
  await loadGameState(game.id);
}

async function postGameAction(path: string, successMessage: string): Promise<void> {
  if (store.selectedGameId === null) return;

  await fetchJson<GameState>(`/games/${String(store.selectedGameId)}/${path}`, {
    method: "POST",
  });

  updateStore({ message: successMessage });
  await loadGames();
  await loadGameState(store.selectedGameId);
}

function connectSSE(): void {
  const eventSource = new EventSource("/api/sse");

  eventSource.addEventListener("open", () => {
    updateStore({ connectionStatus: "connected" });
  });

  eventSource.addEventListener("error", () => {
    updateStore({ connectionStatus: "reconnecting" });
  });

  eventSource.addEventListener("message", (event: MessageEvent) => {
    void handleSseMessage(event.data);
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
}

function renderGameList(): void {
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

    appendText(item, "h4", `Game #${String(game.id)} — ${game.status}`);
    appendText(item, "p", `${String(game.player_count)} player(s)`);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "View Game";
    button.addEventListener("click", () => void loadGameState(game.id));

    item.appendChild(button);
    list.appendChild(item);
  }
}

function renderPlayers(container: HTMLElement, state: GameState): void {
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

function renderDiscard(container: HTMLElement, state: GameState): void {
  const section = appendText(container, "section", "");
  appendText(section, "h4", "Recent cards played");

  if (state.discard.length === 0) {
    appendText(section, "p", "No cards have been played yet.");
    return;
  }

  for (const card of state.discard) {
    appendText(section, "p", `${card.username} drew ${card.value}: ${card.description}`);
  }
}

function renderSelectedGame(): void {
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
  joinButton.addEventListener("click", () => void postGameAction("join", "Joined game."));
  detail.appendChild(joinButton);

  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.textContent = "Start Game";
  startButton.addEventListener("click", () => void postGameAction("start", "Game started."));
  detail.appendChild(startButton);

  const drawButton = document.createElement("button");
  drawButton.type = "button";
  drawButton.textContent = "Draw / Play Card";
  drawButton.addEventListener("click", () => void postGameAction("draw-card", "Card played."));
  detail.appendChild(drawButton);

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
void loadGames();

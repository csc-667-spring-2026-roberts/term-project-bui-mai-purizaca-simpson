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
  pawnNumber: number;
  targetPosition: number;
  description: string;
  splitPawnId?: number;
  splitTargetPosition?: number;
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

async function postAction(path: string, successMessage: string, body?: object): Promise<void> {
  const gameId = store.selectedGameId;
  if (gameId === null) return;

  await fetchJson<GameState>(`/games/${String(gameId)}/${path}`, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  updateStore({ message: successMessage });
  await loadGames();
  await loadGameState(gameId);
}

async function playMove(move: ValidMove): Promise<void> {
  const body: Record<string, number> = {
    pawnId: move.pawnId,
    targetPosition: move.targetPosition,
  };

  if (move.splitPawnId !== undefined) {
    body.splitPawnId = move.splitPawnId;
  }
  if (move.splitTargetPosition !== undefined) {
    body.splitTargetPosition = move.splitTargetPosition;
  }

  await postAction("move-pawn", `Moved pawn ${String(move.pawnNumber)}.`, body);
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

    const button = makeButton("View Game", () => void loadGameState(game.id));
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

function pawnPositionLabel(pawn: Pawn): string {
  if (pawn.is_home) return "Home";
  if (pawn.is_start) return "Start";
  return `Position ${String(pawn.position)}`;
}

function renderPawns(container: HTMLElement, state: GameState): void {
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

function renderPendingCard(container: HTMLElement, state: GameState): void {
  if (state.pendingCard === null) return;

  const section = appendText(container, "section", "");
  appendText(section, "h4", "Drawn Card");
  appendText(section, "p", `Card ${state.pendingCard.value}: ${state.pendingCard.description}`);
}

function renderValidMoves(container: HTMLElement, state: GameState): void {
  if (state.pendingCard === null) return;

  const section = appendText(container, "section", "");
  appendText(section, "h4", "Valid Moves");

  if (state.validMoves.length === 0) {
    appendText(section, "p", "No valid moves — use Forfeit Turn.");
    container.appendChild(
      makeButton("Forfeit Turn", () => void postAction("forfeit-turn", "Turn forfeited.")),
    );
    return;
  }

  for (const move of state.validMoves) {
    const btn = makeButton(move.description, () => void playMove(move));
    section.appendChild(btn);
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
    appendText(section, "p", `${card.username} played ${card.value}: ${card.description}`);
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

  if (state.game.winner_id !== null) {
    const winner = state.players.find((p) => p.id === state.game.winner_id);
    const name = winner !== undefined ? winner.username : "Unknown";
    appendText(detail, "h3", `Winner: ${name}!`);
  }

  renderPlayers(detail, state);
  renderPawns(detail, state);

  if (state.game.status === "waiting") {
    detail.appendChild(makeButton("Join Game", () => void postAction("join", "Joined game.")));
  }

  if (state.game.status === "waiting" && state.players.length >= 2) {
    detail.appendChild(makeButton("Start Game", () => void postAction("start", "Game started.")));
  }

  if (state.game.status === "active" && state.pendingCard === null) {
    detail.appendChild(makeButton("Draw Card", () => void postAction("draw-card", "Card drawn.")));
  }

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
void loadGames();

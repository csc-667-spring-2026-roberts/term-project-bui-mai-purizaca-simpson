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
    updateStore({ message: successMessage });
    await loadGames();
    await loadGameState(gameId);
  } catch (err) {
    updateStore({ message: err instanceof Error ? err.message : "Action failed." });
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
    const dot = document.createElement("span");
    dot.className = `player-dot player-dot--${player.color}`;
    item.appendChild(dot);
    appendText(item, "span", player.username);
    list.appendChild(item);
  }

  section.appendChild(list);
  container.appendChild(section);
}

function pawnPositionLabel(pawn: Pawn): string {
  if (pawn.is_home) return "Home";
  if (pawn.is_start) return "Start";
  return `Position ${String(pawn.position)}`;
}

function renderPawns(container: HTMLElement, state: GameState): void {
  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Pawns");

  if (state.pawns.length === 0) {
    appendText(section, "p", "No pawns yet.");
    container.appendChild(section);
    return;
  }

  const byPlayer = new Map<number, Pawn[]>();
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

function renderPendingCard(container: HTMLElement, state: GameState): void {
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

function renderValidMoves(container: HTMLElement, state: GameState): void {
  if (state.pendingCard === null) return;

  const section = document.createElement("section");
  section.className = "panel-section";
  appendText(section, "h4", "Valid Moves");

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
      `${card.username} played ${card.value}: ${card.description}`,
    ).className = "discard-item";
  }

  section.appendChild(list);
  container.appendChild(section);
}

function renderActions(container: HTMLElement, state: GameState): void {
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
    const winner = state.players.find((p) => p.id === state.game.winner_id);
    const name = winner !== undefined ? winner.username : "Unknown";
    appendText(detail, "div", `${name} wins!`).className = "winner-banner";
  }

  renderPlayers(detail, state);
  renderPawns(detail, state);
  renderActions(detail, state);
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

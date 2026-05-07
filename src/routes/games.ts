import { Router, type Request, type Response } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { broadcast } from "../sse.js";

const router = Router();
const PLAYER_COLORS = ["red", "blue", "yellow", "green"] as const;
const PAWNS_PER_PLAYER = 4;

// ─── Types ────────────────────────────────────────────────────────────────────

type GameSummary = { id: number; status: string; player_count: number; created_at: string };

type PlayerRow = {
  id: number;
  game_id: number;
  user_id: number | null;
  username: string;
  color: string;
  turn_order: number;
};

type CardRow = { id: number; value: string; description: string; move_count: number | null };

type DiscardRow = {
  id: number;
  player_id: number;
  username: string;
  color: string;
  value: string;
  description: string;
  created_at: string;
};

type PawnRow = {
  id: number;
  player_id: number;
  board_space_id: number | null;
  pawn_number: number;
  is_home: boolean;
  is_start: boolean;
  position: number | null;
};

type PawnWithPlayerRow = PawnRow & { color: string; username: string };

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

type GameRow = {
  id: number;
  status: string;
  current_turn: number;
  winner_id: number | null;
  pending_card_id: number | null;
};

type GameState = {
  game: GameRow;
  players: PlayerRow[];
  deckRemaining: number;
  discard: DiscardRow[];
  myPlayerId: number | null;
  pawns: PawnWithPlayerRow[];
  pendingCard: CardRow | null;
  validMoves: ValidMove[];
};

type MovePawnBody = {
  pawnId?: number;
  action?: string;
  targetPawnId?: number;
  pawnId2?: number;
  steps1?: number;
};

type OpponentData = { player: PlayerRow; pawns: PawnRow[] };

type DbTx = {
  none: (query: string, values?: unknown[]) => Promise<null>;
  one: <T>(query: string, values?: unknown[]) => Promise<T>;
  oneOrNone: <T>(query: string, values?: unknown[]) => Promise<T | null>;
  any: <T>(query: string, values?: unknown[]) => Promise<T[]>;
};

// ─── Board constants ──────────────────────────────────────────────────────────

const OUTER_TRACK: number[] = [
  1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32,
  33, 34, 37, 38, 39, 40, 41, 42, 43, 44, 46, 47, 48, 49, 52, 53, 54, 55, 56, 57, 58, 59,
];

const TRACK_LENGTH = OUTER_TRACK.length; // 48

const COLOR_ENTRY_INDEX: Record<string, number> = { red: 0, blue: 12, yellow: 24, green: 36 };

const SAFE_ZONE_POSITION: Record<string, number> = { red: 5, blue: 20, yellow: 35, green: 50 };

// Relative positions: -1=start, 0-47=outer track, 48=safe zone, 49=home

// ─── Movement helpers ──────────────────────────────────────────────────────────

function getRelativePosition(pawn: PawnRow, color: string): number {
  if (pawn.is_start) return -1;
  if (pawn.is_home) return 49;
  const pos = pawn.position;
  if (pos === null) return -1;
  if (pos === SAFE_ZONE_POSITION[color]) return 48;
  const trackIdx = OUTER_TRACK.indexOf(pos);
  if (trackIdx === -1) return -1;
  return (trackIdx - (COLOR_ENTRY_INDEX[color] ?? 0) + TRACK_LENGTH) % TRACK_LENGTH;
}

function relativeToPosition(color: string, relative: number): number | null {
  if (relative < 0) return null;
  if (relative === 48) return SAFE_ZONE_POSITION[color] ?? null;
  if (relative >= 49) return null;
  const trackIdx = ((COLOR_ENTRY_INDEX[color] ?? 0) + relative) % TRACK_LENGTH;
  return OUTER_TRACK[trackIdx] ?? null;
}

// ─── Valid-move helpers (one function per card type) ──────────────────────────

function collectSorryForOpponent(moves: ValidMove[], sp: PawnRow, opp: OpponentData): void {
  for (const op of opp.pawns) {
    const oppRel = getRelativePosition(op, opp.player.color);
    if (!op.is_start && !op.is_home && oppRel < 48) {
      moves.push({
        pawnId: sp.id,
        action: "sorry",
        targetPawnId: op.id,
        label: `Sorry! Pawn ${String(sp.pawn_number)} → ${opp.player.color} pawn ${String(op.pawn_number)}'s spot`,
      });
    }
  }
}

function getSorryMoves(startPawns: PawnRow[], opponents: OpponentData[]): ValidMove[] {
  const moves: ValidMove[] = [];
  for (const sp of startPawns) {
    for (const opp of opponents) collectSorryForOpponent(moves, sp, opp);
  }
  return moves;
}

function addSplitMoves(moves: ValidMove[], color: string, p1: PawnRow, p2: PawnRow): void {
  const rel1 = getRelativePosition(p1, color);
  const rel2 = getRelativePosition(p2, color);
  for (let s1 = 1; s1 <= 6; s1++) {
    const s2 = 7 - s1;
    if (rel1 + s1 > 49 || rel2 + s2 > 49) continue;
    moves.push({
      pawnId: p1.id,
      action: "split",
      newRelative: rel1 + s1,
      pawnId2: p2.id,
      newRelative2: rel2 + s2,
      steps1: s1,
      label: `Split 7: Pawn ${String(p1.pawn_number)} +${String(s1)}, Pawn ${String(p2.pawn_number)} +${String(s2)}`,
    });
  }
}

function getCard7Moves(color: string, myPawns: PawnRow[]): ValidMove[] {
  const moves: ValidMove[] = [];
  for (const pawn of myPawns) {
    if (pawn.is_home || pawn.is_start) continue;
    const rel = getRelativePosition(pawn, color);
    if (rel + 7 <= 49) {
      moves.push({
        pawnId: pawn.id,
        action: "move-forward",
        newRelative: rel + 7,
        label: `Pawn ${String(pawn.pawn_number)}: move 7`,
      });
    }
  }
  const trackPawns = myPawns.filter((p) => !p.is_home && !p.is_start);
  for (let i = 0; i < trackPawns.length; i++) {
    for (let j = i + 1; j < trackPawns.length; j++) {
      const p1 = trackPawns[i];
      const p2 = trackPawns[j];
      if (p1 !== undefined && p2 !== undefined) addSplitMoves(moves, color, p1, p2);
    }
  }
  return moves;
}

function addSwapMoves(
  moves: ValidMove[],
  pawnId: number,
  pawnNum: number,
  opponents: OpponentData[],
): void {
  for (const opp of opponents) {
    for (const op of opp.pawns) {
      const oppRel = getRelativePosition(op, opp.player.color);
      if (!op.is_start && !op.is_home && oppRel < 48) {
        moves.push({
          pawnId,
          action: "swap",
          targetPawnId: op.id,
          label: `Pawn ${String(pawnNum)}: swap with ${opp.player.color} pawn ${String(op.pawn_number)}`,
        });
      }
    }
  }
}

function getCard11Moves(color: string, myPawns: PawnRow[], opponents: OpponentData[]): ValidMove[] {
  const moves: ValidMove[] = [];
  for (const pawn of myPawns) {
    if (pawn.is_home || pawn.is_start) continue;
    const rel = getRelativePosition(pawn, color);
    if (rel + 11 <= 49) {
      moves.push({
        pawnId: pawn.id,
        action: "move-forward",
        newRelative: rel + 11,
        label: `Pawn ${String(pawn.pawn_number)}: move 11`,
      });
    }
    if (rel < 48) addSwapMoves(moves, pawn.id, pawn.pawn_number, opponents);
  }
  return moves;
}

function getCard10Moves(color: string, myPawns: PawnRow[]): ValidMove[] {
  const moves: ValidMove[] = [];
  for (const pawn of myPawns) {
    if (pawn.is_home || pawn.is_start) continue;
    const rel = getRelativePosition(pawn, color);
    if (rel + 10 <= 49) {
      moves.push({
        pawnId: pawn.id,
        action: "move-forward",
        newRelative: rel + 10,
        label: `Pawn ${String(pawn.pawn_number)}: move 10 forward`,
      });
    }
    if (rel < 48) {
      moves.push({
        pawnId: pawn.id,
        action: "move-backward",
        newRelative: (rel - 1 + TRACK_LENGTH) % TRACK_LENGTH,
        label: `Pawn ${String(pawn.pawn_number)}: move 1 backward`,
      });
    }
  }
  return moves;
}

function getCard4Moves(color: string, myPawns: PawnRow[]): ValidMove[] {
  const moves: ValidMove[] = [];
  for (const pawn of myPawns) {
    if (pawn.is_home || pawn.is_start) continue;
    const rel = getRelativePosition(pawn, color);
    if (rel < 48) {
      moves.push({
        pawnId: pawn.id,
        action: "move-backward",
        newRelative: (rel - 4 + TRACK_LENGTH) % TRACK_LENGTH,
        label: `Pawn ${String(pawn.pawn_number)}: move 4 backward`,
      });
    }
  }
  return moves;
}

function getStandardMoves(card: CardRow, color: string, myPawns: PawnRow[]): ValidMove[] {
  const moves: ValidMove[] = [];
  const steps = card.move_count ?? 0;
  for (const pawn of myPawns) {
    if (pawn.is_home) continue;
    if (pawn.is_start) {
      if (card.value !== "1" && card.value !== "2") continue;
      const entryBlocked = myPawns.some(
        (p) => !p.is_home && !p.is_start && getRelativePosition(p, color) === 0,
      );
      if (!entryBlocked) {
        moves.push({
          pawnId: pawn.id,
          action: "exit-start",
          newRelative: 0,
          label: `Pawn ${String(pawn.pawn_number)}: exit Start`,
        });
      }
      continue;
    }
    const rel = getRelativePosition(pawn, color);
    if (steps > 0 && rel + steps <= 49) {
      moves.push({
        pawnId: pawn.id,
        action: "move-forward",
        newRelative: rel + steps,
        label: `Pawn ${String(pawn.pawn_number)}: move ${String(steps)} forward`,
      });
    }
  }
  return moves;
}

function getValidMoves(
  card: CardRow,
  player: PlayerRow,
  myPawns: PawnRow[],
  opponents: OpponentData[],
): ValidMove[] {
  if (card.value === "Sorry")
    return getSorryMoves(
      myPawns.filter((p) => p.is_start),
      opponents,
    );
  if (card.value === "7") return getCard7Moves(player.color, myPawns);
  if (card.value === "11") return getCard11Moves(player.color, myPawns, opponents);
  if (card.value === "10") return getCard10Moves(player.color, myPawns);
  if (card.value === "4") return getCard4Moves(player.color, myPawns);
  return getStandardMoves(card, player.color, myPawns);
}

// ─── Move execution ───────────────────────────────────────────────────────────

async function movePawnToRelative(
  tx: DbTx,
  color: string,
  pawnId: number,
  newRelative: number,
): Promise<void> {
  if (newRelative >= 49) {
    await tx.none(
      "UPDATE pawn SET board_space_id = NULL, is_start = false, is_home = true WHERE id = $1",
      [pawnId],
    );
    return;
  }
  const newPos = relativeToPosition(color, newRelative);
  if (newPos === null) throw new Error("Invalid board position");
  const space = await tx.one<{ id: number }>("SELECT id FROM board_space WHERE position = $1", [
    newPos,
  ]);
  await tx.none(
    "UPDATE pawn SET board_space_id = $1, is_start = false, is_home = false WHERE id = $2",
    [space.id, pawnId],
  );
  if (newRelative < 48) {
    const bumped = await tx.any<{ id: number }>(
      "SELECT id FROM pawn WHERE board_space_id = $1 AND id != $2",
      [space.id, pawnId],
    );
    for (const b of bumped) {
      await tx.none(
        "UPDATE pawn SET board_space_id = NULL, is_start = true, is_home = false WHERE id = $1",
        [b.id],
      );
    }
  }
}

async function executeMove(
  tx: DbTx,
  player: PlayerRow,
  movedPawn: PawnRow,
  move: ValidMove,
  allPawns: PawnRow[],
): Promise<void> {
  if (move.action === "sorry") {
    if (move.targetPawnId === undefined) throw new Error("Missing targetPawnId");
    const target = allPawns.find((p) => p.id === move.targetPawnId);
    if (target === undefined) throw new Error("Target pawn not found");
    await tx.none(
      "UPDATE pawn SET board_space_id = $1, is_start = false, is_home = false WHERE id = $2",
      [target.board_space_id, movedPawn.id],
    );
    await tx.none(
      "UPDATE pawn SET board_space_id = NULL, is_start = true, is_home = false WHERE id = $1",
      [move.targetPawnId],
    );
    return;
  }
  if (move.action === "swap") {
    if (move.targetPawnId === undefined) throw new Error("Missing targetPawnId");
    const target = allPawns.find((p) => p.id === move.targetPawnId);
    if (target === undefined) throw new Error("Target pawn not found");
    await tx.none("UPDATE pawn SET board_space_id = $1 WHERE id = $2", [
      target.board_space_id,
      movedPawn.id,
    ]);
    await tx.none("UPDATE pawn SET board_space_id = $1 WHERE id = $2", [
      movedPawn.board_space_id,
      move.targetPawnId,
    ]);
    return;
  }
  if (move.action === "split") {
    if (
      move.newRelative === undefined ||
      move.pawnId2 === undefined ||
      move.newRelative2 === undefined
    )
      throw new Error("Missing split parameters");
    await movePawnToRelative(tx, player.color, movedPawn.id, move.newRelative);
    const pawn2 = allPawns.find((p) => p.id === move.pawnId2);
    if (pawn2 === undefined) throw new Error("Second pawn not found");
    await movePawnToRelative(tx, player.color, pawn2.id, move.newRelative2);
    return;
  }
  if (move.newRelative === undefined) throw new Error("Missing newRelative");
  await movePawnToRelative(tx, player.color, movedPawn.id, move.newRelative);
}

async function advanceTurn(tx: DbTx, gameId: number, currentTurnOrder: number): Promise<void> {
  await tx.none(
    `UPDATE game SET pending_card_id = NULL, current_turn = COALESCE(
       (SELECT MIN(turn_order) FROM player WHERE game_id = $1 AND turn_order > $2),
       (SELECT MIN(turn_order) FROM player WHERE game_id = $1)
     ) WHERE id = $1`,
    [gameId, currentTurnOrder],
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getSessionUser(request: Request): { id: number; email: string } {
  if (request.session.userId === undefined || request.session.userEmail === undefined) {
    throw new Error("Missing authenticated session");
  }
  return { id: request.session.userId, email: request.session.userEmail };
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a !== undefined && b !== undefined) {
      shuffled[i] = b;
      shuffled[j] = a;
    }
  }
  return shuffled;
}

function buildDeck(cards: CardRow[]): CardRow[] {
  const deck: CardRow[] = [];
  for (const card of cards) {
    const copies = card.value === "10" ? 3 : 4;
    for (let i = 0; i < copies; i++) deck.push(card);
  }
  return deck;
}

async function getGameState(gameId: number, userId: number): Promise<GameState> {
  const game = await db.one<GameRow>(
    "SELECT id, status, current_turn, winner_id, pending_card_id FROM game WHERE id = $1",
    [gameId],
  );
  const players = await db.any<PlayerRow>(
    "SELECT id, game_id, user_id, username, color, turn_order FROM player WHERE game_id = $1 ORDER BY turn_order ASC",
    [gameId],
  );
  const deck = await db.one<{ count: string }>(
    "SELECT COUNT(*) AS count FROM game_deck WHERE game_id = $1 AND drawn_at IS NULL",
    [gameId],
  );
  const discard = await db.any<DiscardRow>(
    `SELECT gd.id, gd.player_id, p.username, p.color, c.value, c.description, gd.created_at
     FROM game_discard gd JOIN player p ON p.id = gd.player_id JOIN card c ON c.id = gd.card_id
     WHERE gd.game_id = $1 ORDER BY gd.id DESC LIMIT 10`,
    [gameId],
  );
  const pawns = await db.any<PawnWithPlayerRow>(
    `SELECT p.id, p.player_id, p.board_space_id, p.pawn_number, p.is_home, p.is_start,
            bs.position, pl.color, pl.username
     FROM pawn p
     LEFT JOIN board_space bs ON bs.id = p.board_space_id
     JOIN player pl ON pl.id = p.player_id
     WHERE p.player_id IN (SELECT id FROM player WHERE game_id = $1)
     ORDER BY p.player_id, p.pawn_number`,
    [gameId],
  );
  const myPlayer = players.find((p) => p.user_id === userId);
  let pendingCard: CardRow | null = null;
  let validMoves: ValidMove[] = [];
  if (game.pending_card_id !== null) {
    pendingCard = await db.one<CardRow>("SELECT * FROM card WHERE id = $1", [game.pending_card_id]);
    if (myPlayer !== undefined && game.current_turn === myPlayer.turn_order) {
      const myPawns = pawns.filter((p) => p.player_id === myPlayer.id);
      const opponents = players
        .filter((p) => p.id !== myPlayer.id)
        .map((p) => ({ player: p, pawns: pawns.filter((pw) => pw.player_id === p.id) }));
      validMoves = getValidMoves(pendingCard, myPlayer, myPawns, opponents);
    }
  }
  return {
    game,
    players,
    deckRemaining: Number(deck.count),
    discard,
    myPlayerId: myPlayer?.id ?? null,
    pawns,
    pendingCard,
    validMoves,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (_request: Request, response: Response): Promise<void> => {
  const games = await db.any<GameSummary>(
    `SELECT g.id, g.status, g.created_at, COUNT(p.id)::int AS player_count
     FROM game g LEFT JOIN player p ON p.game_id = g.id GROUP BY g.id ORDER BY g.id DESC`,
  );
  response.json(games);
});

router.post("/", requireAuth, async (_request: Request, response: Response): Promise<void> => {
  const game = await db.one<{ id: number }>("INSERT INTO game DEFAULT VALUES RETURNING id");
  broadcast({ type: "gamesChanged", gameId: game.id });
  response.status(201).json(game);
});

router.get("/:gameId", requireAuth, async (request: Request, response: Response): Promise<void> => {
  const user = getSessionUser(request);
  const gameId = Number(request.params.gameId);
  if (!Number.isInteger(gameId)) {
    response.status(400).json({ error: "Invalid game id" });
    return;
  }
  response.json(await getGameState(gameId, user.id));
});

router.post(
  "/:gameId/join",
  requireAuth,
  async (request: Request, response: Response): Promise<void> => {
    const user = getSessionUser(request);
    const gameId = Number(request.params.gameId);
    if (!Number.isInteger(gameId)) {
      response.status(400).json({ error: "Invalid game id" });
      return;
    }
    const player = await db.tx(async (tx) => {
      const existing = await tx.oneOrNone<PlayerRow>(
        "SELECT * FROM player WHERE game_id = $1 AND user_id = $2",
        [gameId, user.id],
      );
      if (existing !== null) return existing;
      const countRow = await tx.one<{ count: string }>(
        "SELECT COUNT(*) AS count FROM player WHERE game_id = $1",
        [gameId],
      );
      const count = Number(countRow.count);
      if (count >= PLAYER_COLORS.length) throw new Error("Game is full");
      const color = PLAYER_COLORS[count];
      if (color === undefined) throw new Error("No player color available");
      return tx.one<PlayerRow>(
        `INSERT INTO player (game_id, user_id, username, color, turn_order) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [gameId, user.id, user.email, color, count],
      );
    });
    broadcast({ type: "gamesChanged", gameId });
    broadcast({ type: "gameStateChanged", gameId });
    response.json(player);
  },
);

router.post(
  "/:gameId/start",
  requireAuth,
  async (request: Request, response: Response): Promise<void> => {
    const user = getSessionUser(request);
    const gameId = Number(request.params.gameId);
    if (!Number.isInteger(gameId)) {
      response.status(400).json({ error: "Invalid game id" });
      return;
    }
    await db.tx(async (tx) => {
      const players = await tx.any<PlayerRow>(
        "SELECT * FROM player WHERE game_id = $1 ORDER BY turn_order ASC",
        [gameId],
      );
      if (players.length < 2) throw new Error("At least two players must join before starting");
      const cards = await tx.any<CardRow>("SELECT * FROM card ORDER BY id ASC");
      const shuffledDeck = shuffle(buildDeck(cards));
      await tx.none("DELETE FROM game_deck WHERE game_id = $1", [gameId]);
      await tx.none("DELETE FROM game_discard WHERE game_id = $1", [gameId]);
      await tx.none(
        "DELETE FROM pawn WHERE player_id IN (SELECT id FROM player WHERE game_id = $1)",
        [gameId],
      );
      for (let i = 0; i < shuffledDeck.length; i++) {
        const card = shuffledDeck[i];
        if (card !== undefined)
          await tx.none(
            "INSERT INTO game_deck (game_id, card_id, deck_order) VALUES ($1, $2, $3)",
            [gameId, card.id, i],
          );
      }
      for (const player of players) {
        for (let n = 1; n <= PAWNS_PER_PLAYER; n++)
          await tx.none("INSERT INTO pawn (player_id, pawn_number) VALUES ($1, $2)", [
            player.id,
            n,
          ]);
      }
      await tx.none(
        "UPDATE game SET status = 'active', current_turn = 0, pending_card_id = NULL WHERE id = $1",
        [gameId],
      );
    });
    broadcast({ type: "gamesChanged", gameId });
    broadcast({ type: "gameStateChanged", gameId });
    response.json(await getGameState(gameId, user.id));
  },
);

router.post(
  "/:gameId/draw-card",
  requireAuth,
  async (request: Request, response: Response): Promise<void> => {
    const user = getSessionUser(request);
    const gameId = Number(request.params.gameId);
    if (!Number.isInteger(gameId)) {
      response.status(400).json({ error: "Invalid game id" });
      return;
    }
    await db.tx(async (tx) => {
      const game = await tx.one<GameRow>(
        "SELECT id, status, current_turn, winner_id, pending_card_id FROM game WHERE id = $1",
        [gameId],
      );
      if (game.status !== "active") throw new Error("Game is not active");
      if (game.pending_card_id !== null) throw new Error("A card has already been drawn this turn");
      const player = await tx.one<PlayerRow>(
        "SELECT * FROM player WHERE game_id = $1 AND user_id = $2",
        [gameId, user.id],
      );
      if (game.current_turn !== player.turn_order) throw new Error("Not your turn");
      let deckCard = await tx.oneOrNone<{ id: number; card_id: number }>(
        "SELECT id, card_id FROM game_deck WHERE game_id = $1 AND drawn_at IS NULL ORDER BY deck_order ASC LIMIT 1",
        [gameId],
      );
      if (deckCard === null) {
        const cards = await tx.any<CardRow>("SELECT * FROM card ORDER BY id ASC");
        const reshuffled = shuffle(buildDeck(cards));
        const maxOrder = await tx.one<{ max: number | null }>(
          "SELECT MAX(deck_order) AS max FROM game_deck WHERE game_id = $1",
          [gameId],
        );
        let nextOrder = (maxOrder.max ?? 0) + 1;
        for (const card of reshuffled)
          await tx.none(
            "INSERT INTO game_deck (game_id, card_id, deck_order) VALUES ($1, $2, $3)",
            [gameId, card.id, nextOrder++],
          );
        await tx.none("DELETE FROM game_discard WHERE game_id = $1", [gameId]);
        deckCard = await tx.one<{ id: number; card_id: number }>(
          "SELECT id, card_id FROM game_deck WHERE game_id = $1 AND drawn_at IS NULL ORDER BY deck_order ASC LIMIT 1",
          [gameId],
        );
      }
      await tx.none("UPDATE game_deck SET drawn_at = NOW() WHERE id = $1", [deckCard.id]);
      await tx.none("INSERT INTO game_discard (game_id, player_id, card_id) VALUES ($1, $2, $3)", [
        gameId,
        player.id,
        deckCard.card_id,
      ]);
      const turnRow = await tx.one<{ turn_number: number }>(
        "SELECT COALESCE(MAX(turn_number), 0) + 1 AS turn_number FROM turn WHERE game_id = $1",
        [gameId],
      );
      await tx.none(
        "INSERT INTO turn (game_id, player_id, card_id, turn_number, action_taken) VALUES ($1, $2, $3, $4, 'draw_card')",
        [gameId, player.id, deckCard.card_id, turnRow.turn_number],
      );
      await tx.none("UPDATE game SET pending_card_id = $1 WHERE id = $2", [
        deckCard.card_id,
        gameId,
      ]);
    });
    broadcast({ type: "gameStateChanged", gameId });
    response.json(await getGameState(gameId, user.id));
  },
);

async function processMoveTransaction(
  tx: DbTx,
  gameId: number,
  userId: number,
  body: MovePawnBody,
): Promise<void> {
  const game = await tx.one<GameRow>(
    "SELECT id, status, current_turn, winner_id, pending_card_id FROM game WHERE id = $1",
    [gameId],
  );
  if (game.status !== "active") throw new Error("Game is not active");
  if (game.pending_card_id === null) throw new Error("No card has been drawn yet");
  const player = await tx.one<PlayerRow>(
    "SELECT * FROM player WHERE game_id = $1 AND user_id = $2",
    [gameId, userId],
  );
  if (game.current_turn !== player.turn_order) throw new Error("Not your turn");
  const card = await tx.one<CardRow>("SELECT * FROM card WHERE id = $1", [game.pending_card_id]);
  const allPlayers = await tx.any<PlayerRow>("SELECT * FROM player WHERE game_id = $1", [gameId]);
  const allPawns = await tx.any<PawnRow>(
    `SELECT p.id, p.player_id, p.board_space_id, p.pawn_number, p.is_home, p.is_start, bs.position
     FROM pawn p LEFT JOIN board_space bs ON bs.id = p.board_space_id
     WHERE p.player_id IN (SELECT id FROM player WHERE game_id = $1)`,
    [gameId],
  );
  const myPawns = allPawns.filter((p) => p.player_id === player.id);
  const opponents = allPlayers
    .filter((p) => p.id !== player.id)
    .map((p) => ({ player: p, pawns: allPawns.filter((pw) => pw.player_id === p.id) }));
  const validMoves = getValidMoves(card, player, myPawns, opponents);
  const { pawnId, action, targetPawnId, pawnId2, steps1 } = body;
  if (typeof pawnId !== "number") throw new Error("Missing pawnId");
  if (typeof action !== "string") throw new Error("Missing action");
  const matched = validMoves.find((m) => {
    if (m.pawnId !== pawnId || m.action !== action) return false;
    if (m.targetPawnId !== undefined && m.targetPawnId !== targetPawnId) return false;
    if (m.pawnId2 !== undefined && m.pawnId2 !== pawnId2) return false;
    if (m.steps1 !== undefined && m.steps1 !== steps1) return false;
    return true;
  });
  if (matched === undefined) throw new Error("Invalid move");
  const movedPawn = myPawns.find((p) => p.id === pawnId);
  if (movedPawn === undefined) throw new Error("Pawn not found");
  await executeMove(tx, player, movedPawn, matched, allPawns);
  const turnRow = await tx.one<{ turn_number: number }>(
    "SELECT COALESCE(MAX(turn_number), 0) + 1 AS turn_number FROM turn WHERE game_id = $1",
    [gameId],
  );
  await tx.none(
    "INSERT INTO turn (game_id, player_id, card_id, pawn_id, turn_number, action_taken) VALUES ($1, $2, $3, $4, $5, $6)",
    [gameId, player.id, card.id, pawnId, turnRow.turn_number, `move_${action}`],
  );
  const myPawnsAfter = await tx.any<{ is_home: boolean }>(
    "SELECT is_home FROM pawn WHERE player_id = $1",
    [player.id],
  );
  if (myPawnsAfter.every((p) => p.is_home)) {
    await tx.none(
      "UPDATE game SET status = 'finished', winner_id = $1, pending_card_id = NULL WHERE id = $2",
      [player.user_id, gameId],
    );
  } else if (card.value === "2") {
    await tx.none("UPDATE game SET pending_card_id = NULL WHERE id = $1", [gameId]);
  } else {
    await advanceTurn(tx, gameId, player.turn_order);
  }
}

router.post(
  "/:gameId/move-pawn",
  requireAuth,
  async (request: Request, response: Response): Promise<void> => {
    const user = getSessionUser(request);
    const gameId = Number(request.params.gameId);
    if (!Number.isInteger(gameId)) {
      response.status(400).json({ error: "Invalid game id" });
      return;
    }
    await db.tx(async (tx) => {
      await processMoveTransaction(tx, gameId, user.id, request.body as MovePawnBody);
    });
    broadcast({ type: "gamesChanged", gameId });
    broadcast({ type: "gameStateChanged", gameId });
    response.json(await getGameState(gameId, user.id));
  },
);

router.post(
  "/:gameId/forfeit-turn",
  requireAuth,
  async (request: Request, response: Response): Promise<void> => {
    const user = getSessionUser(request);
    const gameId = Number(request.params.gameId);
    if (!Number.isInteger(gameId)) {
      response.status(400).json({ error: "Invalid game id" });
      return;
    }
    await db.tx(async (tx) => {
      const game = await tx.one<GameRow>(
        "SELECT id, status, current_turn, winner_id, pending_card_id FROM game WHERE id = $1",
        [gameId],
      );
      if (game.status !== "active") throw new Error("Game is not active");
      if (game.pending_card_id === null) throw new Error("No card has been drawn yet");
      const player = await tx.one<PlayerRow>(
        "SELECT * FROM player WHERE game_id = $1 AND user_id = $2",
        [gameId, user.id],
      );
      if (game.current_turn !== player.turn_order) throw new Error("Not your turn");
      await advanceTurn(tx, gameId, player.turn_order);
    });
    broadcast({ type: "gameStateChanged", gameId });
    response.json(await getGameState(gameId, user.id));
  },
);

export default router;

import { Router, type Request, type Response } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { broadcast } from "../sse.js";

const router = Router();
const PLAYER_COLORS = ["red", "blue", "yellow", "green"] as const;
const PAWNS_PER_PLAYER = 4;

type GameSummary = {
  id: number;
  status: string;
  player_count: number;
  created_at: string;
};

type PlayerRow = {
  id: number;
  game_id: number;
  user_id: number | null;
  username: string;
  color: string;
  turn_order: number;
};

type CardRow = {
  id: number;
  value: string;
  description: string;
};

type DiscardRow = {
  id: number;
  player_id: number;
  username: string;
  color: string;
  value: string;
  description: string;
  created_at: string;
};

type GameState = {
  game: { id: number; status: string; current_turn: number };
  players: PlayerRow[];
  deckRemaining: number;
  discard: DiscardRow[];
  myPlayerId: number | null;
};

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
    const current = shuffled[i];
    const replacement = shuffled[j];

    if (current !== undefined && replacement !== undefined) {
      shuffled[i] = replacement;
      shuffled[j] = current;
    }
  }

  return shuffled;
}

async function getGameState(gameId: number, userId: number): Promise<GameState> {
  const game = await db.one<{
    id: number;
    status: string;
    current_turn: number;
  }>("SELECT id, status, current_turn FROM game WHERE id = $1", [gameId]);

  const players = await db.any<PlayerRow>(
    `
    SELECT id, game_id, user_id, username, color, turn_order
    FROM player
    WHERE game_id = $1
    ORDER BY turn_order ASC
    `,
    [gameId],
  );

  const deck = await db.one<{ count: string }>(
    `
    SELECT COUNT(*) AS count
    FROM game_deck
    WHERE game_id = $1 AND drawn_at IS NULL
    `,
    [gameId],
  );

  const discard = await db.any<DiscardRow>(
    `
    SELECT gd.id, gd.player_id, p.username, p.color, c.value, c.description,
      gd.created_at
    FROM game_discard gd
    JOIN player p ON p.id = gd.player_id
    JOIN card c ON c.id = gd.card_id
    WHERE gd.game_id = $1
    ORDER BY gd.id DESC
    LIMIT 10
    `,
    [gameId],
  );

  const myPlayer = players.find((player) => player.user_id === userId);

  return {
    game,
    players,
    deckRemaining: Number(deck.count),
    discard,
    myPlayerId: myPlayer?.id ?? null,
  };
}

async function sendGameState(response: Response, gameId: number, userId: number): Promise<void> {
  const state = await getGameState(gameId, userId);
  response.json(state);
}

router.get("/", requireAuth, async (_request: Request, response: Response): Promise<void> => {
  const games = await db.any<GameSummary>(
    `
      SELECT g.id, g.status, g.created_at, COUNT(p.id)::int AS player_count
      FROM game g
      LEFT JOIN player p ON p.game_id = g.id
      GROUP BY g.id
      ORDER BY g.id DESC
      `,
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

  await sendGameState(response, gameId, user.id);
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

    const player = await db.tx(async (transaction) => {
      const existing = await transaction.oneOrNone<PlayerRow>(
        "SELECT * FROM player WHERE game_id = $1 AND user_id = $2",
        [gameId, user.id],
      );

      if (existing !== null) {
        return existing;
      }

      const countRow = await transaction.one<{ count: string }>(
        "SELECT COUNT(*) AS count FROM player WHERE game_id = $1",
        [gameId],
      );
      const count = Number(countRow.count);

      if (count >= PLAYER_COLORS.length) {
        throw new Error("Game is full");
      }

      const color = PLAYER_COLORS[count];

      if (color === undefined) {
        throw new Error("No player color available");
      }

      return transaction.one<PlayerRow>(
        `
        INSERT INTO player (game_id, user_id, username, color, turn_order)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
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

    await db.tx(async (transaction) => {
      const players = await transaction.any<PlayerRow>(
        "SELECT * FROM player WHERE game_id = $1 ORDER BY turn_order ASC",
        [gameId],
      );

      if (players.length < 2) {
        throw new Error("At least two players must join before starting");
      }

      const cards = await transaction.any<CardRow>("SELECT * FROM card ORDER BY id ASC");
      const shuffledCards = shuffle(cards);

      await transaction.none("DELETE FROM game_deck WHERE game_id = $1", [gameId]);
      await transaction.none("DELETE FROM game_discard WHERE game_id = $1", [gameId]);
      await transaction.none(
        `
        DELETE FROM pawn
        WHERE player_id IN (SELECT id FROM player WHERE game_id = $1)
        `,
        [gameId],
      );

      for (let index = 0; index < shuffledCards.length; index += 1) {
        const card = shuffledCards[index];

        if (card !== undefined) {
          await transaction.none(
            `
            INSERT INTO game_deck (game_id, card_id, deck_order)
            VALUES ($1, $2, $3)
            `,
            [gameId, card.id, index],
          );
        }
      }

      for (const player of players) {
        for (let pawnNumber = 1; pawnNumber <= PAWNS_PER_PLAYER; pawnNumber += 1) {
          await transaction.none("INSERT INTO pawn (player_id, pawn_number) VALUES ($1, $2)", [
            player.id,
            pawnNumber,
          ]);
        }
      }

      await transaction.none("UPDATE game SET status = 'active', current_turn = 0 WHERE id = $1", [
        gameId,
      ]);
    });

    const state = await getGameState(gameId, user.id);
    broadcast({ type: "gamesChanged", gameId });
    broadcast({ type: "gameStateChanged", gameId });
    response.json(state);
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

    await db.tx(async (transaction) => {
      const player = await transaction.one<PlayerRow>(
        "SELECT * FROM player WHERE game_id = $1 AND user_id = $2",
        [gameId, user.id],
      );

      const deckCard = await transaction.oneOrNone<{
        id: number;
        card_id: number;
      }>(
        `
        SELECT id, card_id
        FROM game_deck
        WHERE game_id = $1 AND drawn_at IS NULL
        ORDER BY deck_order ASC
        LIMIT 1
        `,
        [gameId],
      );

      if (deckCard === null) {
        throw new Error("The deck is empty");
      }

      const turnRow = await transaction.one<{ turn_number: number }>(
        `
        SELECT COALESCE(MAX(turn_number), 0) + 1 AS turn_number
        FROM turn
        WHERE game_id = $1
        `,
        [gameId],
      );

      await transaction.none("UPDATE game_deck SET drawn_at = NOW() WHERE id = $1", [deckCard.id]);

      await transaction.none(
        `
        INSERT INTO game_discard (game_id, player_id, card_id)
        VALUES ($1, $2, $3)
        `,
        [gameId, player.id, deckCard.card_id],
      );

      await transaction.none(
        `
        INSERT INTO turn (game_id, player_id, card_id, turn_number, action_taken)
        VALUES ($1, $2, $3, $4, 'draw_card')
        `,
        [gameId, player.id, deckCard.card_id, turnRow.turn_number],
      );

      await transaction.none(
        `
        UPDATE game
        SET current_turn = (
          SELECT COALESCE(MIN(turn_order), 0)
          FROM player
          WHERE game_id = $1 AND turn_order > $2
        )
        WHERE id = $1
        `,
        [gameId, player.turn_order],
      );
    });

    const state = await getGameState(gameId, user.id);
    broadcast({ type: "gameStateChanged", gameId });
    response.json(state);
  },
);

export default router;

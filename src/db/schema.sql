 -- Run:  psql -d "$DATABASE_URL" -f schema.sql

-- test_table
CREATE TABLE IF NOT EXISTS test_table (
  id         SERIAL PRIMARY KEY,
  message    TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- game
CREATE TABLE IF NOT EXISTS game (
  id           SERIAL PRIMARY KEY,
  status       VARCHAR(20)  NOT NULL DEFAULT 'waiting', -- waiting | active | finished
  current_turn INT          NOT NULL DEFAULT 0,
  winner_id    INT,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- player
CREATE TABLE IF NOT EXISTS player (
  id         SERIAL PRIMARY KEY,
  game_id    INT         NOT NULL REFERENCES game(id)   ON DELETE CASCADE,
  username   VARCHAR(50) NOT NULL,
  color      VARCHAR(10) NOT NULL,   -- red | blue | green | yellow
  turn_order INT         NOT NULL,
  is_winner  BOOLEAN     NOT NULL DEFAULT false
);

-- board_space (seeded once, static
CREATE TABLE IF NOT EXISTS board_space (
  id          SERIAL PRIMARY KEY,
  position    INT         NOT NULL UNIQUE,  -- 0–59
  space_type  VARCHAR(20) NOT NULL,         -- normal | start | safe_zone | home
  color       VARCHAR(10),                  -- null for shared spaces
  is_safe_zone BOOLEAN    NOT NULL DEFAULT false,
  is_start    BOOLEAN     NOT NULL DEFAULT false,
  is_home     BOOLEAN     NOT NULL DEFAULT false
);

-- pawn
CREATE TABLE IF NOT EXISTS pawn (
  id             SERIAL PRIMARY KEY,
  player_id      INT NOT NULL REFERENCES player(id)      ON DELETE CASCADE,
  board_space_id INT          REFERENCES board_space(id), -- NULL = in start area
  pawn_number    INT NOT NULL,   -- 1–4 per player
  is_home        BOOLEAN NOT NULL DEFAULT false,
  is_start       BOOLEAN NOT NULL DEFAULT true
);

-- card (reference / lookup — not per-deck instances)
CREATE TABLE IF NOT EXISTS card (
  id          SERIAL PRIMARY KEY,
  value       VARCHAR(10) NOT NULL UNIQUE,
  description TEXT        NOT NULL,
  move_count  INT                    -- NULL for Sorry and 7 (split)
);

-- turn (append-only audit log of every move)
CREATE TABLE IF NOT EXISTS turn (
  id           SERIAL PRIMARY KEY,
  game_id      INT NOT NULL REFERENCES game(id)    ON DELETE CASCADE,
  player_id    INT NOT NULL REFERENCES player(id),
  card_id      INT NOT NULL REFERENCES card(id),
  pawn_id      INT NOT NULL REFERENCES pawn(id),
  turn_number  INT NOT NULL,
  action_taken VARCHAR(50) NOT NULL,  -- move | sorry | switch | skip
  created_at   TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- seed card reference data
INSERT INTO card (value, description, move_count) VALUES
  ('1',     'Move out of Start OR move 1 forward',                           1),
  ('2',     'Move out of Start OR move 2 forward. Draw again.',              2),
  ('3',     'Move 3 forward',                                                3),
  ('4',     'Move 4 backward',                                              -4),
  ('5',     'Move 5 forward',                                                5),
  ('7',     'Move 7 forward, or split between two pawns',                    7),
  ('8',     'Move 8 forward',                                                8),
  ('10',    'Move 10 forward OR 1 backward',                                10),
  ('11',    'Move 11 forward OR switch with any opponent pawn',             11),
  ('12',    'Move 12 forward',                                              12),
  ('Sorry', 'Take pawn from Start, bump opponent pawn back to their Start', NULL)
ON CONFLICT (value) DO NOTHING;

-- users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

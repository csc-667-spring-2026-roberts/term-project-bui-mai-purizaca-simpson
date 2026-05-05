-- Run locally:
-- psql "$DATABASE_URL" -f src/db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_table (
  id SERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game (
  id SERIAL PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  current_turn INT NOT NULL DEFAULT 0,
  winner_id INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player (
  id SERIAL PRIMARY KEY,
  game_id INT NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(100) NOT NULL,
  color VARCHAR(10) NOT NULL,
  turn_order INT NOT NULL,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, user_id),
  UNIQUE (game_id, color)
);

CREATE TABLE IF NOT EXISTS board_space (
  id SERIAL PRIMARY KEY,
  position INT NOT NULL UNIQUE,
  space_type VARCHAR(20) NOT NULL,
  color VARCHAR(10),
  is_safe_zone BOOLEAN NOT NULL DEFAULT false,
  is_start BOOLEAN NOT NULL DEFAULT false,
  is_home BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS pawn (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  board_space_id INT REFERENCES board_space(id),
  pawn_number INT NOT NULL,
  is_home BOOLEAN NOT NULL DEFAULT false,
  is_start BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (player_id, pawn_number)
);

CREATE TABLE IF NOT EXISTS card (
  id SERIAL PRIMARY KEY,
  value VARCHAR(10) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  move_count INT
);

CREATE TABLE IF NOT EXISTS game_deck (
  id SERIAL PRIMARY KEY,
  game_id INT NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  card_id INT NOT NULL REFERENCES card(id),
  deck_order INT NOT NULL,
  drawn_at TIMESTAMP,
  UNIQUE (game_id, deck_order)
);

CREATE TABLE IF NOT EXISTS game_discard (
  id SERIAL PRIMARY KEY,
  game_id INT NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  card_id INT NOT NULL REFERENCES card(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS turn (
  id SERIAL PRIMARY KEY,
  game_id INT NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES player(id),
  card_id INT NOT NULL REFERENCES card(id),
  pawn_id INT REFERENCES pawn(id),
  turn_number INT NOT NULL,
  action_taken VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO card (value, description, move_count) VALUES
  ('1', 'Move out of Start OR move 1 forward', 1),
  ('2', 'Move out of Start OR move 2 forward. Draw again.', 2),
  ('3', 'Move 3 forward', 3),
  ('4', 'Move 4 backward', -4),
  ('5', 'Move 5 forward', 5),
  ('7', 'Move 7 forward, or split between two pawns', 7),
  ('8', 'Move 8 forward', 8),
  ('10', 'Move 10 forward OR move 1 backward', 10),
  ('11', 'Move 11 forward OR switch with any opponent pawn', 11),
  ('12', 'Move 12 forward', 12),
  ('Sorry', 'Take pawn from Start and bump an opponent pawn back to Start', NULL)
ON CONFLICT (value) DO NOTHING;

INSERT INTO board_space (position, space_type, color, is_safe_zone, is_start, is_home)
VALUES
  (0, 'start', 'red', false, true, false),
  (1, 'normal', NULL, false, false, false),
  (2, 'normal', NULL, false, false, false),
  (3, 'normal', NULL, false, false, false),
  (4, 'normal', NULL, false, false, false),
  (5, 'safe_zone', 'red', true, false, false),
  (6, 'home', 'red', false, false, true),

  (15, 'start', 'blue', false, true, false),
  (16, 'normal', NULL, false, false, false),
  (17, 'normal', NULL, false, false, false),
  (18, 'normal', NULL, false, false, false),
  (19, 'normal', NULL, false, false, false),
  (20, 'safe_zone', 'blue', true, false, false),
  (21, 'home', 'blue', false, false, true),

  (30, 'start', 'yellow', false, true, false),
  (31, 'normal', NULL, false, false, false),
  (32, 'normal', NULL, false, false, false),
  (33, 'normal', NULL, false, false, false),
  (34, 'normal', NULL, false, false, false),
  (35, 'safe_zone', 'yellow', true, false, false),
  (36, 'home', 'yellow', false, false, true),

  (45, 'start', 'green', false, true, false),
  (46, 'normal', NULL, false, false, false),
  (47, 'normal', NULL, false, false, false),
  (48, 'normal', NULL, false, false, false),
  (49, 'normal', NULL, false, false, false),
  (50, 'safe_zone', 'green', true, false, false),
  (51, 'home', 'green', false, false, true)
ON CONFLICT (position) DO NOTHING;
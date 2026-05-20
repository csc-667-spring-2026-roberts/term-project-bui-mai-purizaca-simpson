# Sorry! — Multiplayer Board Game

CSC 667 Term Project — Spring 2026

## Team Members

| Name | GitHub | Email |
|------|--------|-------|
| Julia Bui | @juliabui | jbui1@sfsu.edu |
| Zaniya Simpson | @ZSimpson12 | zsimpson@sfsu.edu |
| Gabriel Purizaca | @gabep23 | gpurizaca@sfsu.edu |
| Vincent Mai | @username | email@sfsu.edu |

## Game

**Sorry!** is a classic board game where each player races 4 pawns from their Start zone around the board and into their Home. Players draw cards each turn to move their pawns, bump opponents back to Start, and use special cards like Sorry (steal a spot), 11 (swap with an opponent), 7 (split moves between two pawns), and more.

First player to get all 4 pawns Home wins.

## Local Dev Setup

### Prerequisites
- Node.js ≥ 20
- PostgreSQL running locally

### Steps

```bash
git clone <repo-url>
cd term-project-bui-mai-purizaca-simpson

npm install

cp .env.example .env
# Edit .env — set DATABASE_URL to your local Postgres connection string
# Example: DATABASE_URL=postgres://localhost:5432/sorry_game
# Also set SESSION_SECRET to any random string

npm run dev
```

Open http://localhost:3000

The `npm run dev` command runs the TypeScript server (with hot reload) and the esbuild client bundler concurrently. The DB schema and seed data are applied automatically on first startup via `src/db/migrate.ts`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript + bundle client JS |
| `npm start` | Run compiled server (production) |
| `npm run lint` | Check for lint errors |
| `npm run lint:fix` | Auto-fix lint errors |
| `npm run format` | Format code with Prettier |
| `npm test` | Run tests |

## Deployed URL

> Add your deployment URL here once deployed.

## Architecture

- **Backend**: Express 5 + TypeScript, server-side rendered views (EJS)
- **Database**: PostgreSQL via pg-promise, session store via connect-pg-simple
- **Real-time**: Server-Sent Events (SSE) for live game state updates
- **Auth**: bcrypt password hashing, session-based auth
- **Client**: Vanilla TypeScript bundled with esbuild

## Implemented Game Rules

- Cards 1–12 + Sorry card (44-card deck per official rules)
- Card 1 & 2: exit Start OR move forward; card 2 grants an extra draw
- Card 4: move 4 backward
- Card 7: move 7 forward, or split between two pawns in any combination totaling 7
- Card 10: move 10 forward OR 1 backward
- Card 11: move 11 forward OR swap places with any opponent pawn on the outer track
- Sorry card: take a pawn from Start and bump any opponent pawn back to their Start
- Bumping: landing on an opponent sends them back to Start (not in safe zone/home)
- Safe zone: one protected space per color before Home — cannot be bumped there
- Win condition: first player to move all 4 pawns Home wins
- Forfeit turn: if no valid moves exist, player must forfeit their turn
- Deck reshuffle: when the draw pile is empty, it reshuffles from the discard pile

## Known Limitations

- **Safe zone length**: The safe zone corridor is simplified to one space (entry point only) instead of the official 5-space safety zone. Once a pawn reaches the safe zone entry it moves directly home on the next valid move.
- **Player display names**: Players are shown by their registration email address; there is no separate display name field.
- **No spectator mode**: Players not in a game can see the board but their pawn controls are hidden. There is no dedicated spectator view.
- **Max players**: 4 players per game (matches the board — red, blue, yellow, green).
- **Skip-turn restriction**: The "Skip Turn" button (for disconnected players) is blocked by the server if the current player still has an active SSE connection. In rare cases (slow reconnect), a skip might succeed briefly before the player reconnects. Refresh the page to rejoin.

## Credits / Attribution

- Game rules based on the official **Sorry!** board game by Hasbro.
- No third-party assets used. Board layout and card deck implemented from scratch.

import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { addClient, broadcast, removeClient } from "../sse.js";

const router = Router();

// GET /api/sse?gameId=<id>
// Establishes a persistent SSE connection for the authenticated user.
// Optional gameId query param subscribes the client to a specific game room.
router.get("/sse", requireAuth, (request, response) => {
  const userId = request.session.userId as number;
  const gameIdParam = request.query.gameId;
  const gameId = typeof gameIdParam === "string" ? Number(gameIdParam) : undefined;

  const clientId = addClient(response, userId, gameId);

  request.on("close", () => {
    removeClient(clientId);
  });
});

// POST /api/sse/broadcast
// Broadcasts a JSON payload to all connected SSE clients.
// Used for testing and for server-initiated state pushes.
router.post("/sse/broadcast", requireAuth, (request, response) => {
  broadcast(request.body as object);
  response.json({ ok: true });
});

export default router;

import { Router, type Request, type Response } from "express";
import { addClient, removeClient } from "../sse.js";

const router = Router();

router.get("/sse", (request: Request, response: Response): void => {
  const userId = request.session.userId;

  if (userId === undefined) {
    response.status(401).json({ error: "Not authenticated" });
    return;
  }

  const gameIdRaw = request.query.gameId;
  const gameId =
    typeof gameIdRaw === "string" && gameIdRaw.length > 0 ? Number(gameIdRaw) : undefined;

  const clientId = addClient(response, userId, Number.isInteger(gameId) ? gameId : undefined);

  request.on("close", () => {
    removeClient(clientId);
  });
});

export default router;

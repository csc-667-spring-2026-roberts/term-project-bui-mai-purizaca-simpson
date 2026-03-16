import { Router, type Request, type Response } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

type TestRow = {
  id: number;
  message: string;
  created_at: string;
};

router.get("/", requireAuth, async (request: Request, response: Response): Promise<void> => {
  const message = `${request.method} ${request.path} by user ${String(request.session.userId)} at ${new Date().toLocaleTimeString()}`;
  await db.none("INSERT INTO test_table (message) VALUES ($1)", [message]);
  const records = await db.any<TestRow>("SELECT * FROM test_table ORDER BY id DESC");

  response.json(records);
});

export default router;

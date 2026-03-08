import { Router } from "express";
import db from "../db/connection.js";

const router = Router();
router.get("/", async (request, response) => {
  const message = `${request.method} ${request.path} at ${new Date().toLocaleTimeString()}`;
  await db.none("INSERT INTO test_table (message) VALUES ($1)", [message]);
  const records = await db.any("SELECT * FROM test_table");

  response.json(records);
});

export default router;

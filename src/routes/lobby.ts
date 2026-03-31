import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.get("/", requireAuth, (_request, response) => {
  const { user } = _request.session.user;

  response.render("lobby", { user });
});

export default router;

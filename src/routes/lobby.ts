import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.get("/", requireAuth, (_request, response) => {
  const { userId, userEmail } = _request.session;
  response.render("lobby", { user: { id: userId, email: userEmail } });
});
export default router;

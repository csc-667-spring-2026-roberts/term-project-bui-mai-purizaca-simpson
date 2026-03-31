import { Router } from "express";

const router = Router();

router.get("/", (_request, response) => {
  if (_request.session.userId) {
    response.redirect("/lobby");
  } else {
    response.redirect("/auth/login");
  }
});

export default router;

import { type Request, type Response, type NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.userId === undefined) {
    res.redirect("/auth/login");
    return;
  }

  next();
}

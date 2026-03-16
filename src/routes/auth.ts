import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import db from "../db/connection.js";

const router = Router();
const SALT_ROUNDS = 10;

type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
};

type RegisterBody = {
  email?: string;
  password?: string;
};

router.post(
  "/register",
  async (
    req: Request<Record<string, never>, Record<string, never>, RegisterBody>,
    res: Response,
  ): Promise<void> => {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.trim() === "" ||
      password.length < 6
    ) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const existingUser = await db.oneOrNone<UserRow>("SELECT * FROM users WHERE email = $1", [
        normalizedEmail,
      ]);

      if (existingUser !== null) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const newUser = await db.one<{ id: number; email: string }>(
        `
        INSERT INTO users (email, password_hash)
        VALUES ($1, $2)
        RETURNING id, email
        `,
        [normalizedEmail, passwordHash],
      );

      req.session.userId = newUser.id;
      req.session.userEmail = newUser.email;

      res.status(201).json({
        message: "Registered successfully",
        user: newUser,
      });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/login",
  async (
    req: Request<Record<string, never>, Record<string, never>, RegisterBody>,
    res: Response,
  ): Promise<void> => {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string" || email.trim() === "") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const user = await db.oneOrNone<UserRow>("SELECT * FROM users WHERE email = $1", [
        normalizedEmail,
      ]);

      if (user === null) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const passwordMatches = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatches) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      req.session.userId = user.id;
      req.session.userEmail = user.email;

      res.json({
        message: "Logged in successfully",
        user: {
          id: user.id,
          email: user.email,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Server error" });
    }
  },
);

router.post("/logout", (req: Request, res: Response): void => {
  req.session.destroy((error: Error | null) => {
    if (error !== null) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Could not log out" });
      return;
    }

    res.clearCookie("connect.sid");
    res.json({ message: "Logged out successfully" });
  });
});

export default router;

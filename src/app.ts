/**
 * app setup, middleware, and route mounting
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import testRoutes from "./routes/test.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PgSession = connectPgSimple(session);

const sessionSecret = process.env.SESSION_SECRET;
if (sessionSecret === undefined) {
  throw new Error("SESSION_SECRET is undefined");
}

// body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgSession({
      conObject: {
        connectionString: process.env.DATABASE_URL,
      },
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

// static files
app.use(express.static(path.join(__dirname, "../public")));

app.use("/auth", authRoutes);
app.use("/test", testRoutes);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;

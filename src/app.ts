/**
 * app setup, middleware, and route mounting
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import dotenv from "dotenv";
import expressLayouts from "express-ejs-layouts";
import livereload from "livereload";
import connectLivereload from "connect-livereload";

import authRoutes from "./routes/auth.js";
import gamesRoutes from "./routes/games.js";
import homeRoutes from "./routes/home.js";
import lobbyRoutes from "./routes/lobby.js";
import sseRoutes from "./routes/sse.js";
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

app.set("trust proxy", 1);

if (process.env.NODE_ENV !== "production") {
  const liveReloadServer = livereload.createServer({
    exts: ["ejs", "css", "js"],
  });

  liveReloadServer.watch([
    path.join(__dirname, "..", "views"),
    path.join(__dirname, "..", "public"),
  ]);

  app.use(connectLivereload());
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "layout");
app.set("views", path.join(__dirname, "..", "views"));

app.use(
  session({
    store: new PgSession({
      conObject: {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
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

app.use(express.static(path.join(__dirname, "../public")));

app.use("/auth", authRoutes);
app.use("/games", gamesRoutes);
app.use("/test", testRoutes);
app.use("/lobby", lobbyRoutes);
app.use("/api", sseRoutes);
app.use("/", homeRoutes);

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

export default app;

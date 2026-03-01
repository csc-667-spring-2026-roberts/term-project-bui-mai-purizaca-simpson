import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Static files
app.use(express.static(path.join(__dirname, "../../public")));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Home route
app.get("/", (req: Request, res: Response) => {
  res.send("<h1>Sorry! - Multiplayer Game</h1><p>Server is running.</p>");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

export default app;
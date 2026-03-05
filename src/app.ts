/**
 *  app setup, middleware, and route mouting
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Static path:", path.join(__dirname, "../public"));

const app = express();

// static files
app.use(express.static(path.join(__dirname, "../public")));

// body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res) => {
  console.log("Hit fallback route:", req.method, req.url);
  res.send("fallback");
});


export default app;
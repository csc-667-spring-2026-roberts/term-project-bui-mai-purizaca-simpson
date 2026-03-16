/**
 *  entry point to start server
 */

import app from "./app.js";

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${String(PORT)}`);
});

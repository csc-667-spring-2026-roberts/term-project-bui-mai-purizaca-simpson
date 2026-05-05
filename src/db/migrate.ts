import fs from "fs/promises";
import path from "path";
import db from "./connection.js";

async function runMigration(): Promise<void> {
  const schemaPath = path.join(process.cwd(), "src", "db", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");

  await db.none(schema);
  console.log("Database schema migrated successfully.");
}

runMigration()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Database migration failed:", error);
    process.exit(1);
  });

import pgPromise from "pg-promise";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (connectionString === undefined) {
  throw new Error("DATABASE_URL is undefined");
}

const sslConfig = process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false;

const db = pgPromise()({
  connectionString,
  ssl: sslConfig,
});

export default db;

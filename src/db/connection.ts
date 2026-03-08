import pgPromise from "pg-promise";
import dotenv from "dotenv";

//load env variable
dotenv.config();
const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined) {
  throw new Error("Connection string undefined");
}

export default pgPromise()(connectionString);

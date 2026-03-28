import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
  path: "../../apps/server/.env",
});

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL?.startsWith("file:")
      ? process.env.DATABASE_URL
      : process.env.DATABASE_URL?.endsWith(".db") || process.env.DATABASE_URL?.endsWith(".sqlite")
        ? process.env.DATABASE_URL
        : "./local.db",
  },
});

import alchemy from "alchemy";
import { D1Database, Vite, Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("Manujujaya-Manajemen-stock");

export const database = await D1Database("database", {
  name: "manujujaya-stock",
  migrationsDir: "../../packages/db/src/migrations",
});

export const api = await Worker("api", {
  cwd: "../../apps/server",
  entrypoint: "src/worker.ts",
  url: true,
  bindings: {
    DB: database,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN ?? "http://localhost:3001,http://localhost:5173",
  },
});

export const web = await Vite("web", {
  cwd: "../../apps/web",
  assets: "dist",
  bindings: {
    VITE_SERVER_URL: api.url,
  },
});

console.log(`API    -> ${api.url}`);
console.log(`Web    -> ${web.url}`);

await app.finalize();

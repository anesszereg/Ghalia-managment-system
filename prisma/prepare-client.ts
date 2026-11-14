import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

export function clientSchema(databaseUrl = "") {
  if (!databaseUrl || databaseUrl.startsWith("file:")) return "prisma/schema.prisma";
  if (/^postgres(?:ql)?:/.test(databaseUrl)) return "prisma/postgres/schema.prisma";
  throw new Error("DATABASE_URL must use file:, postgres:, or postgresql:.");
}

export function prepareClient() {
  const root = path.resolve(__dirname, "..");
  loadEnvConfig(root, !process.argv.includes("--production") && process.env.NODE_ENV !== "production");
  const schema = clientSchema(process.env.DATABASE_URL);
  const run = (file: string, args: string[], env = process.env) => execFileSync(process.execPath, [file, ...args], { cwd: root, env, stdio: "inherit" });
  if (schema === "prisma/postgres/schema.prisma") run(require.resolve("tsx/cli"), ["prisma/prepare-postgres.ts"]);
  run(path.join(root, "node_modules/prisma/build/index.js"), ["generate", "--schema", schema], {
    ...process.env,
    DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });
}

if (require.main === module) prepareClient();

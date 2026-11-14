import { execFileSync } from "node:child_process";
import path from "node:path";

function deploy() {
  if (process.env.NETLIFY === "true" && process.env.CONTEXT !== "production") throw new Error("Only production builds may initialize the hosted database.");
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    if (!/^postgres(?:ql)?:/.test(process.env[key] || "")) throw new Error(`Set ${key} to the hosted PostgreSQL connection before deploying.`);
  }
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("Set AUTH_SECRET to a random value of at least 32 characters.");
  const run = (file: string, args: string[] = []) => execFileSync(process.execPath, [file, ...args], { stdio: "inherit", env: process.env });
  const prisma = path.resolve("node_modules/prisma/build/index.js");
  run(require.resolve("tsx/cli"), ["prisma/prepare-postgres.ts"]);
  run(prisma, ["generate", "--schema", "prisma/postgres/schema.prisma"]);
  run(prisma, ["migrate", "deploy", "--schema", "prisma/postgres/schema.prisma"]);
  run(require.resolve("tsx/cli"), ["prisma/bootstrap.ts"]);
  run(require.resolve("next/dist/bin/next"), ["build"]);
}

try {
  deploy();
} catch (error) {
  console.error(error instanceof Error && !("status" in error) ? error.message : "Deployment stopped because a required step failed.");
  process.exitCode = 1;
}

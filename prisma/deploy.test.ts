import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const config = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(config.buildCommand, "npm run build:hosted");
assert.equal(pkg.scripts["build:hosted"], "tsx prisma/deploy.ts");
for (const scenario of [
  { VERCEL: "1", VERCEL_ENV: "preview" },
  { VERCEL: "1", VERCEL_ENV: "development" },
  { NETLIFY: "true", CONTEXT: "deploy-preview" },
  { VERCEL: "1", VERCEL_ENV: "production" },
]) {
  const env = { ...process.env, NETLIFY: "", CONTEXT: "", VERCEL: "", VERCEL_ENV: "", DATABASE_URL: "", DIRECT_URL: "", AUTH_SECRET: "", ...scenario };
  const result = spawnSync(process.execPath, [require.resolve("tsx/cli"), path.join(root, "prisma/deploy.ts")], { cwd: root, env, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, scenario.VERCEL_ENV === "production" ? /Set DATABASE_URL/ : /Only production builds/);
}
console.log("PASS: Vercel uses the hosted build; previews cannot initialize the production database; missing production configuration fails before database access.");

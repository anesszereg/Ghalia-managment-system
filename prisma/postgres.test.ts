import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import bcrypt from "bcryptjs";

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to allocate a test port");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function main() {
  const directory = mkdtempSync("/tmp/showroom-postgres-");
  const data = path.join(directory, "data");
  const port = await unusedPort();
  const appPort = await unusedPort();
  const database = `postgresql://showroom_test@127.0.0.1:${port}/showroom_test`;
  const freshDatabase = `postgresql://showroom_test@127.0.0.1:${port}/showroom_fresh`;
  const secret = "postgres-local-test-secret-not-for-deployment-1234";
  const env = { ...process.env, DATABASE_URL: database, DIRECT_URL: database, AUTH_SECRET: secret, RESEND_API_KEY: "", SALE_NOTIFICATION_FROM: "", SALE_NOTIFICATION_TO: "", CRON_SECRET: "postgres-cron-test-not-for-production-123" };
  const prisma = path.resolve("node_modules/prisma/build/index.js");
  const tsx = require.resolve("tsx/cli");
  const run = (file: string, args: string[], options: { env?: NodeJS.ProcessEnv; stdio?: "pipe" | "inherit" } = {}) => execFileSync(file, args, { env, stdio: "pipe", ...options });
  let started = false;
  let app: ChildProcess | undefined;
  let output = "";
  let db: import("@prisma/client").PrismaClient | undefined;
  let fresh: import("@prisma/client").PrismaClient | undefined;
  try {
    run("initdb", ["-D", data, "-A", "trust", "-U", "showroom_test", "--no-locale", "--encoding=UTF8"]);
    run("pg_ctl", ["-D", data, "-l", path.join(directory, "postgres.log"), "-w", "-o", `-h 127.0.0.1 -p ${port} -k ${directory} -F`, "start"]);
    started = true;
    for (const name of ["showroom_test", "showroom_fresh"]) run("createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", "showroom_test", name]);
    run(process.execPath, [tsx, "prisma/prepare-postgres.ts"]);
    run(process.execPath, [prisma, "generate", "--schema", "prisma/postgres/schema.prisma"]);
    const migrationName = process.env.PRISMA_CREATE_MIGRATION;
    if (migrationName && !/^[a-z0-9_]+$/.test(migrationName)) throw new Error("Invalid test migration name");
    if (!existsSync("prisma/postgres/migrations") || migrationName) run(process.execPath, [prisma, "migrate", "dev", "--create-only", "--name", migrationName || "initial", "--schema", "prisma/postgres/schema.prisma"]);
    run(process.execPath, [prisma, "migrate", "deploy", "--schema", "prisma/postgres/schema.prisma"]);
    run(process.execPath, [tsx, "prisma/caisse.test.ts"], { env: { ...env, TEST_DATABASE_URL: database, NODE_ENV: "test" }, stdio: "inherit" });
    const { PrismaClient } = await import("@prisma/client");
    const { initializeHostedDatabase } = await import("./bootstrap");
    const freshEnv = { ...env, DATABASE_URL: freshDatabase, DIRECT_URL: freshDatabase, ADMIN_EMAIL: "owner@example.com", ADMIN_PASSWORD: "local-test-password-only-123", SHOWROOM_NAME: "Fresh test showroom" };
    run(process.execPath, [prisma, "migrate", "deploy", "--schema", "prisma/postgres/schema.prisma"], { env: freshEnv });
    fresh = new PrismaClient({ datasources: { db: { url: freshDatabase } } });
    await assert.rejects(initializeHostedDatabase(fresh, { ...freshEnv, AUTH_SECRET: "short" }), /AUTH_SECRET/);
    await assert.rejects(initializeHostedDatabase(fresh, { ...freshEnv, ADMIN_PASSWORD: "admin123" }), /ADMIN_PASSWORD/);
    assert.equal(await initializeHostedDatabase(fresh, freshEnv), true);
    const owner = await fresh.user.findUniqueOrThrow({ where: { email: freshEnv.ADMIN_EMAIL } });
    assert.equal(await bcrypt.compare(freshEnv.ADMIN_PASSWORD, owner.passwordHash), true);
    assert.equal(owner.role, "admin");
    assert.deepEqual(await Promise.all([fresh.product.count(), fresh.sale.count(), fresh.purchase.count(), fresh.payment.count(), fresh.expense.count(), fresh.cashMovement.count(), fresh.cashSession.count(), fresh.saleEmailNotification.count()]), [0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal((await fresh.cashbook.findUniqueOrThrow({ where: { id: 1 } })).baselineCents, 0);
    assert.equal(await initializeHostedDatabase(fresh, { ...freshEnv, ADMIN_PASSWORD: "different-test-password-123" }), false);
    assert.equal((await fresh.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash, owner.passwordHash);
    assert.equal(await fresh.user.count(), 1);
    assert.match(run(process.execPath, [tsx, "prisma/bootstrap.ts"], { env: freshEnv }).toString(), /Existing installation preserved/);
    db = new PrismaClient({ datasources: { db: { url: database } } });
    const password = "browser-test-password-only-123";
    await db.user.update({ where: { email: "test@example.com" }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    run(process.execPath, [tsx, "prisma/deploy.ts"], { env: { ...env, NODE_ENV: "production", NETLIFY: "true", CONTEXT: "production" }, stdio: "inherit" });
    app = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(appPort)], { env: { ...env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
    app.stdout?.on("data", chunk => { output = (output + chunk.toString()).slice(-12000); });
    app.stderr?.on("data", chunk => { output = (output + chunk.toString()).slice(-12000); });
    const base = `http://localhost:${appPort}`;
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { if ((await fetch(`${base}/login`)).status === 200) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(ready, true, output);
    const loginPage = await (await fetch(`${base}/login`)).text();
    const action = loginPage.match(/name="(\$ACTION_ID_[^"]+)"/);
    assert.ok(action, "Login server action was not rendered");
    const form = new FormData();
    form.set(action[1], ""); form.set("email", "test@example.com"); form.set("password", password);
    const login = await fetch(`${base}/login`, { method: "POST", body: form, headers: { Origin: base }, redirect: "manual" });
    assert.equal(login.status, 303, output);
    const session = login.headers.get("set-cookie") || "";
    assert.match(session, /HttpOnly/i); assert.match(session, /Secure/i); assert.match(session, /SameSite=Lax/i);
    const headers = { Cookie: session.split(";")[0] };
    for (const route of ["/", "/caisse", "/products", "/products?filter=low", "/products?q=Test", "/suppliers", "/suppliers?q=vendor", "/sales", "/sales?filter=unpaid", "/sales?filter=overdue", "/purchases", "/purchases?filter=unpaid", "/purchases?filter=overdue", "/payments", "/expenses", "/reports", "/settings", "/sales/new", "/purchases/new", "/print/report"]) {
      const response = await fetch(base + route, { headers });
      assert.equal(response.status, 200, `${route}: ${output}`);
      await response.text();
    }
    const queuedSale = await db.sale.findUniqueOrThrow({ where: { ref: "EMAIL-1" } });
    const queuedPage = await fetch(`${base}/sales/${queuedSale.id}`, { headers });
    assert.equal(queuedPage.status, 200);
    assert.match(await queuedPage.text(), /Email awaiting setup/);
    const sentSale = await db.sale.findUniqueOrThrow({ where: { ref: "EMAIL-2" } });
    assert.match(await (await fetch(`${base}/sales/${sentSale.id}`, { headers })).text(), /Email sent/);
    assert.equal((await fetch(`${base}/api/cron/sale-emails`)).status, 401);
    for (const type of ["sales", "purchases", "payments", "expenses", "caisse", "inventory", "debts"]) {
      const response = await fetch(`${base}/api/export?type=${type}`, { headers });
      assert.equal(response.status, 200, output);
      assert.match(response.headers.get("content-type") || "", /text\/csv/);
    }
    assert.equal((await fetch(`${base}/api/backup`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/api/backup`)).status, 401);
    const anonymous = await fetch(`${base}/caisse`, { redirect: "manual" });
    assert.equal(anonymous.status, 307);
    assert.equal(anonymous.headers.get("location"), "/login");
    assert.doesNotMatch(output, /PrismaClient(?:KnownRequest|UnknownRequest|Initialization)Error|⨯/);
    console.log("PASS: PostgreSQL accounting, secure fresh initialization, idempotency, production login/cookies, dashboard, reports, lists, forms, CSV exports, backup, and access control. Only temporary databases were used.");
  } finally {
    if (app && app.exitCode === null) {
      const exited = new Promise(resolve => app!.once("exit", resolve));
      app.kill("SIGTERM");
      await exited;
    }
    await db?.$disconnect(); await fresh?.$disconnect();
    if (started) run("pg_ctl", ["-D", data, "-w", "-m", "fast", "stop"]);
    run(process.execPath, [prisma, "generate"], { env: process.env });
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

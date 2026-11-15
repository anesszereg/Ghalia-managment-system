import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { deliverSaleEmail, queueSaleEmail, saleEmailBody } from "../src/lib/sale-email";

export async function verifySaleEmails(cancelledSaleId: number) {
  const url = process.env.DATABASE_URL || "";
  assert.ok((url.startsWith("file:") && url.includes("showroom-caisse-")) || /^postgres(?:ql)?:\/\/[^/]+@127\.0\.0\.1:\d+\/showroom_test(?:\?|$)/.test(url), "Email tests require an isolated accounting-test database");
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.SALE_NOTIFICATION_FROM, to: process.env.SALE_NOTIFICATION_TO, cron: process.env.CRON_SECRET, tz: process.env.TZ };
  let sequence = 0;
  const item = { name: '<script>alert("x")</script> & mirror', qty: 2, unitPrice: 50, total: 100 };
  const fixture = () => prisma.$transaction(async tx => {
    const sale = await tx.sale.create({ data: { ref: `EMAIL-${++sequence}`, total: 100, paid: 0, customerName: "Vente comptoir" } });
    await queueSaleEmail(tx, sale, [item]);
    return sale;
  });
  let calls = 0;
  const success: typeof fetch = async () => { calls++; return Response.json({ id: `test-email-${calls}` }); };
  try {
    process.env.TZ = "UTC";
    const missing = await fixture();
    assert.equal(await deliverSaleEmail(missing.id, success), "NOT_CONFIGURED");
    assert.equal(calls, 0);
    assert.equal((await prisma.saleEmailNotification.findUniqueOrThrow({ where: { saleId: missing.id } })).attempts, 0);
    process.env.RESEND_API_KEY = "not-a-real-resend-key";
    process.env.SALE_NOTIFICATION_FROM = "sales@example.com";
    process.env.SALE_NOTIFICATION_TO = "owner@example.com";
    assert.equal(await deliverSaleEmail(cancelledSaleId, success), "SKIPPED");
    assert.equal(calls, 0);
    const saleCount = await prisma.sale.count();
    const emailCount = await prisma.saleEmailNotification.count();
    await assert.rejects(prisma.$transaction(async tx => {
      const sale = await tx.sale.create({ data: { ref: "EMAIL-ROLLBACK" } });
      await queueSaleEmail(tx, sale, [item]);
      throw new Error("Rollback email and sale together");
    }), /Rollback/);
    assert.equal(await prisma.sale.count(), saleCount);
    assert.equal(await prisma.saleEmailNotification.count(), emailCount);
    const mail = saleEmailBody({ showroom: "Ghalia <&>", currency: "DZD", ref: "SALE-TEST", date: "2026-01-01T12:00:00.000Z", total: 90, paid: 30, discount: 10, items: [item] }, "sales@example.com", "owner@example.com");
    assert.ok(mail.html.includes("&lt;script&gt;"));
    assert.ok(!mail.html.includes("<script>"));
    assert.match(mail.text, /Remaining: 60\.00 DZD/);
    assert.match(mail.text, /Discount: 10\.00 DZD/);
    const retry = await fixture();
    const bodies: string[] = [], keys: string[] = [];
    const failure: typeof fetch = async (_url, options) => {
      calls++; bodies.push(String(options?.body)); keys.push(new Headers(options?.headers).get("Idempotency-Key") || "");
      return Response.json({ message: "Do not persist provider response bodies or secrets" }, { status: 503 });
    };
    assert.equal(await deliverSaleEmail(retry.id, failure), "FAILED");
    let row = await prisma.saleEmailNotification.findUniqueOrThrow({ where: { saleId: retry.id } });
    assert.equal(row.attempts, 1);
    assert.equal(row.lastError, "RESEND_HTTP_503");
    assert.ok(row.retryAt.getTime() > Date.now());
    const oldCalls = calls;
    assert.equal(await deliverSaleEmail(retry.id, success), "DEFERRED");
    assert.equal(calls, oldCalls);
    await prisma.sale.update({ where: { id: retry.id }, data: { total: 250 } });
    await prisma.saleEmailNotification.update({ where: { saleId: retry.id }, data: { retryAt: new Date(0) } });
    process.env.SALE_NOTIFICATION_TO = "changed@example.com";
    const retrySuccess: typeof fetch = async (_url, options) => {
      calls++; bodies.push(String(options?.body)); keys.push(new Headers(options?.headers).get("Idempotency-Key") || "");
      return Response.json({ id: "retry-accepted" });
    };
    assert.equal(await deliverSaleEmail(retry.id, retrySuccess), "SENT");
    assert.equal(bodies[0], bodies[1]);
    assert.equal(keys[0], keys[1]);
    assert.deepEqual(JSON.parse(bodies[1]).to, ["owner@example.com"]);
    assert.ok(JSON.parse(bodies[1]).text.includes("Total: 100.00 DZD"));
    row = await prisma.saleEmailNotification.findUniqueOrThrow({ where: { saleId: retry.id } });
    assert.equal(row.messageId, "retry-accepted");
    assert.equal(row.attempts, 2);
    assert.ok(row.sentAt);
    assert.equal(await deliverSaleEmail(retry.id, success), "UNCHANGED");
    const concurrent = await fixture();
    let unblock!: () => void, transportStarted!: () => void;
    const gate = new Promise<void>(resolve => { unblock = resolve; });
    const started = new Promise<void>(resolve => { transportStarted = resolve; });
    const slow: typeof fetch = async () => { calls++; transportStarted(); await gate; return Response.json({ id: "concurrent-accepted" }); };
    const sending = deliverSaleEmail(concurrent.id, slow);
    await started;
    const duringSend = calls;
    assert.equal(await deliverSaleEmail(concurrent.id, success), "DEFERRED");
    assert.equal(calls, duringSend);
    unblock();
    assert.equal(await sending, "SENT");
    const stale = await fixture();
    await prisma.saleEmailNotification.update({ where: { saleId: stale.id }, data: { status: "SENDING", attempts: 1, lockToken: "abandoned", lockedAt: new Date(Date.now() - 6 * 60000), firstAttemptAt: new Date(Date.now() - 6 * 60000) } });
    assert.equal(await deliverSaleEmail(stale.id, success), "SENT");
    const expired = await fixture();
    await prisma.saleEmailNotification.update({ where: { saleId: expired.id }, data: { status: "FAILED", attempts: 1, firstAttemptAt: new Date(Date.now() - 24 * 3600000), retryAt: new Date(0) } });
    const beforeExpired = calls;
    assert.equal(await deliverSaleEmail(expired.id, success), "REVIEW");
    assert.equal(calls, beforeExpired);
    const exhausted = await fixture();
    await prisma.saleEmailNotification.update({ where: { saleId: exhausted.id }, data: { status: "FAILED", attempts: 8 } });
    assert.equal(await deliverSaleEmail(exhausted.id, success), "REVIEW");
    const { GET } = await import("../src/app/api/cron/sale-emails/route");
    process.env.CRON_SECRET = "";
    assert.equal((await GET(new Request("http://localhost/api/cron/sale-emails"))).status, 503);
    process.env.CRON_SECRET = "cron-test-secret-not-for-production-123";
    assert.equal((await GET(new Request("http://localhost/api/cron/sale-emails"))).status, 401);
    process.env.RESEND_API_KEY = "";
    assert.equal((await GET(new Request("http://localhost/api/cron/sale-emails", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))).status, 503);
    console.log("PASS: transactional email outbox, immutable sale snapshots, escaped email content, mocked Resend delivery, backoff, stable idempotency, concurrency protection, stale leases, cancellation, retry limits, and secured cron. No real emails sent.");
  } finally {
    for (const [key, value] of Object.entries({ RESEND_API_KEY: saved.key, SALE_NOTIFICATION_FROM: saved.from, SALE_NOTIFICATION_TO: saved.to, CRON_SECRET: saved.cron, TZ: saved.tz })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

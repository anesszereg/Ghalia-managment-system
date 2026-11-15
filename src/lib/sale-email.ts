import { randomUUID } from "node:crypto";
import type { Prisma, Sale } from "@prisma/client";
import { prisma } from "./db";

type Item = { name: string; qty: number; unitPrice: number; total: number };
type Snapshot = { showroom: string; currency: string; ref: string; date: string; total: number; paid: number; discount: number; items: Item[] };
const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60000;
const RETRY_WINDOW_MS = 23 * 3600000;
const emailAddress = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function config() {
  return { key: process.env.RESEND_API_KEY?.trim() || "", from: process.env.SALE_NOTIFICATION_FROM?.trim() || "", to: process.env.SALE_NOTIFICATION_TO?.trim() || "" };
}

export function saleEmailConfigured() {
  const { key, from, to } = config();
  return !!key && emailAddress.test(from) && emailAddress.test(to);
}

export async function queueSaleEmail(tx: Prisma.TransactionClient, sale: Sale, items: Item[]) {
  const settings = await tx.setting.findUnique({ where: { id: 1 } });
  const snapshot: Snapshot = {
    showroom: settings?.showroomName || "Showroom", currency: settings?.currency || "DZD", ref: sale.ref,
    date: sale.date.toISOString(), total: sale.total, paid: sale.paid, discount: sale.discount,
    items: items.map(({ name, qty, unitPrice, total }) => ({ name, qty, unitPrice, total })),
  };
  return tx.saleEmailNotification.create({ data: { saleId: sale.id, payload: JSON.stringify(snapshot) } });
}

export function saleEmailBody(snapshot: Snapshot, from: string, to: string) {
  const money = (n: number) => `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${snapshot.currency}`;
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: process.env.TZ || "UTC" }).format(new Date(snapshot.date));
  const totals = `Total: ${money(snapshot.total)}\nCash paid: ${money(snapshot.paid)}\nRemaining: ${money(Math.max(0, snapshot.total - snapshot.paid))}`;
  const items = snapshot.items.map(i => `${i.name} — ${i.qty} × ${money(i.unitPrice)} = ${money(i.total)}`).join("\n");
  const discount = snapshot.discount > 0 ? `\nDiscount: ${money(snapshot.discount)}` : "";
  return {
    from, to: [to], subject: `New sale ${snapshot.ref} - ${snapshot.showroom}`.replace(/[\r\n]/g, " "),
    text: `${snapshot.showroom}\nNew counter sale: ${snapshot.ref}\n${date} (${process.env.TZ || "UTC"})\n\n${items}${discount}\n\n${totals}`,
    html: `<h1>${escapeHtml(snapshot.showroom)}</h1><h2>New counter sale: ${escapeHtml(snapshot.ref)}</h2><p>${escapeHtml(date)} (${escapeHtml(process.env.TZ || "UTC")})</p><table cellpadding="8" cellspacing="0"><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${snapshot.items.map(i => `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.qty)}</td><td>${escapeHtml(money(i.unitPrice))}</td><td>${escapeHtml(money(i.total))}</td></tr>`).join("")}</tbody></table>${snapshot.discount > 0 ? `<p>Discount: ${escapeHtml(money(snapshot.discount))}</p>` : ""}<p><strong>Total: ${escapeHtml(money(snapshot.total))}</strong></p><p>Cash paid: ${escapeHtml(money(snapshot.paid))}</p><p>Remaining: ${escapeHtml(money(Math.max(0, snapshot.total - snapshot.paid)))}</p>`,
  };
}

export async function deliverSaleEmail(saleId: number, transport: typeof fetch = fetch) {
  const notification = await prisma.saleEmailNotification.findUnique({ where: { saleId }, include: { sale: { select: { status: true } } } });
  if (!notification || ["SENT", "SKIPPED", "REVIEW"].includes(notification.status)) return "UNCHANGED";
  const cfg = config();
  if (!cfg.key || (!notification.requestBody && !saleEmailConfigured())) return "NOT_CONFIGURED";
  const now = new Date();
  const token = randomUUID();
  const eligible: Prisma.SaleEmailNotificationWhereInput = {
    id: notification.id,
    OR: [
      { status: { in: ["PENDING", "FAILED"] }, retryAt: { lte: now } },
      { status: "SENDING", lockedAt: { lte: new Date(now.getTime() - LEASE_MS) } },
    ],
  };
  if (notification.attempts >= MAX_ATTEMPTS || (notification.firstAttemptAt && now.getTime() - notification.firstAttemptAt.getTime() > RETRY_WINDOW_MS)) {
    await prisma.saleEmailNotification.updateMany({ where: eligible, data: { status: "REVIEW", lastError: "Automatic retry limit reached; check Resend before resending.", lockToken: "", lockedAt: null } });
    return "REVIEW";
  }
  const claimed = await prisma.saleEmailNotification.updateMany({
    where: { ...eligible, attempts: { lt: MAX_ATTEMPTS } },
    data: { status: "SENDING", lockToken: token, lockedAt: now, firstAttemptAt: notification.firstAttemptAt || now, attempts: { increment: 1 } },
  });
  if (!claimed.count) return "DEFERRED";
  const row = await prisma.saleEmailNotification.findUniqueOrThrow({ where: { id: notification.id } });
  const owned = { id: row.id, status: "SENDING", lockToken: token };
  if (notification.sale.status !== "confirmed") {
    await prisma.saleEmailNotification.updateMany({ where: owned, data: { status: "SKIPPED", lastError: "Sale cancelled before email submission.", lockedAt: null, lockToken: "" } });
    return "SKIPPED";
  }
  let requestBody = row.requestBody;
  if (!requestBody) {
    try { requestBody = JSON.stringify(saleEmailBody(JSON.parse(row.payload), cfg.from, cfg.to)); }
    catch {
      await prisma.saleEmailNotification.updateMany({ where: owned, data: { status: "REVIEW", lastError: "Invalid email snapshot or timezone configuration.", lockedAt: null, lockToken: "" } });
      return "REVIEW";
    }
    await prisma.saleEmailNotification.updateMany({ where: owned, data: { requestBody } });
  }
  try {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json", "Idempotency-Key": `sale-email/${row.id}` },
      body: requestBody, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`RESEND_HTTP_${response.status}`);
    const data = await response.json();
    if (typeof data.id !== "string" || !data.id || data.id.length > 255) throw new Error("RESEND_RESPONSE");
    await prisma.saleEmailNotification.updateMany({ where: owned, data: { status: "SENT", sentAt: new Date(), messageId: data.id, lastError: "", lockedAt: null, lockToken: "" } });
    return "SENT";
  } catch (error) {
    const lastError = error instanceof Error && /^RESEND_HTTP_\d+$/.test(error.message) ? error.message : "Resend request failed or timed out; safe retry queued.";
    await prisma.saleEmailNotification.updateMany({ where: owned, data: {
      status: row.attempts >= MAX_ATTEMPTS ? "REVIEW" : "FAILED", lastError,
      retryAt: new Date(Date.now() + Math.min(3600, 60 * 2 ** (row.attempts - 1)) * 1000), lockedAt: null, lockToken: "",
    } });
    return "FAILED";
  }
}

export async function retrySaleEmails() {
  const now = new Date();
  const rows = await prisma.saleEmailNotification.findMany({
    where: { OR: [{ status: { in: ["PENDING", "FAILED"] }, retryAt: { lte: now } }, { status: "SENDING", lockedAt: { lte: new Date(now.getTime() - LEASE_MS) } }] },
    orderBy: { createdAt: "asc" }, take: 5, select: { saleId: true },
  });
  const results = [];
  for (const row of rows) results.push({ saleId: row.saleId, status: await deliverSaleEmail(row.saleId) });
  return results;
}

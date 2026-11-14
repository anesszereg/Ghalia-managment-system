"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { cashBalance, cashContext, cents, requireCashUser } from "./caisse";

function refresh() {
  revalidatePath("/", "layout");
  redirect("/caisse");
}

export async function initializeCaisseAction() {
  const user = await requireCashUser();
  if (user.role !== "admin") throw new Error("Administrator required");
  await prisma.$transaction(async (tx) => {
    if (await tx.cashbook.findUnique({ where: { id: 1 } })) return;
    const payments = await tx.payment.findMany({ where: { voided: false } });
    const expenses = await tx.expense.findMany();
    if (payments.some(p => p.method !== "cash") || expenses.some(e => e.method !== "cash"))
      throw new Error("Historical non-cash records must be reconciled before importing");
    await tx.cashbook.create({ data: { id: 1, baselineCents: 0, provisional: true } });
    for (const p of payments) {
      if (!(p.amount > 0) || !["SALE", "PURCHASE"].includes(p.type)) throw new Error("Invalid historical payment");
      await tx.cashMovement.create({ data: {
        sourceKey: `payment:${p.id}`, paymentId: p.id, amountCents: cents(p.amount) * (p.type === "SALE" ? 1 : -1),
        kind: p.type === "SALE" ? "CUSTOMER_PAYMENT" : "SUPPLIER_PAYMENT", reference: p.ref,
        date: p.date, historical: true, userId: user.id, notes: "Imported from historical cash payment",
      } });
    }
    for (const e of expenses) {
      if (!(e.amount > 0)) throw new Error("Invalid historical expense");
      await tx.cashMovement.create({ data: {
        sourceKey: `expense:${e.id}:import`, expenseId: e.id, amountCents: -cents(e.amount), kind: "EXPENSE",
        reference: e.ref, date: e.date, historical: true, userId: user.id, notes: "Imported from historical cash expense",
      } });
    }
    await tx.auditLog.create({ data: { action: "INITIALIZE", entity: "Cashbook", entityId: 1, userId: user.id, detail: "Historical import; provisional opening balance 0" } });
  });
  refresh();
}

export async function openCaisseAction() {
  const user = await requireCashUser();
  await prisma.$transaction(async (tx) => {
    if (!await tx.cashbook.findUnique({ where: { id: 1 } })) throw new Error("Initialize caisse first");
    if (await tx.cashSession.findUnique({ where: { openKey: 1 } })) throw new Error("A session is already open");
    const session = await tx.cashSession.create({ data: { openKey: 1, openedBy: user.id, openingCents: await cashBalance(tx) } });
    await tx.auditLog.create({ data: { action: "OPEN", entity: "CashSession", entityId: session.id, userId: user.id } });
  });
  refresh();
}

export async function closeCaisseAction(form: FormData) {
  const user = await requireCashUser();
  const countedCents = cents(Number(form.get("counted")));
  const notes = String(form.get("notes") || "").trim();
  if (!form.get("counted") || countedCents < 0) throw new Error("Enter the cash counted");
  await prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.findUnique({ where: { openKey: 1 } });
    if (!session || session.id !== Number(form.get("sessionId"))) throw new Error("Session has changed; refresh the page");
    if (session.openedBy !== user.id && user.role !== "admin") throw new Error("Only the session operator or an administrator can close it");
    const expectedCents = await cashBalance(tx);
    const differenceCents = countedCents - expectedCents;
    if (differenceCents && !notes) throw new Error("Explain the cash discrepancy");
    if (differenceCents) await tx.cashMovement.create({ data: {
      sourceKey: `closing:${session.id}`, amountCents: differenceCents, kind: "CLOSING_DIFFERENCE",
      reference: `SESSION-${session.id}`, notes, sessionId: session.id, userId: user.id,
    } });
    await tx.cashSession.update({ where: { id: session.id }, data: {
      openKey: null, closedAt: new Date(), closedBy: user.id, expectedCents, countedCents, differenceCents, notes,
    } });
    await tx.auditLog.create({ data: { action: "CLOSE", entity: "CashSession", entityId: session.id, userId: user.id, detail: `Expected ${expectedCents}; counted ${countedCents}; difference ${differenceCents}; ${notes}` } });
  });
  refresh();
}

export async function manualCashAction(form: FormData) {
  const amountCents = cents(Number(form.get("amount")));
  const kind = String(form.get("kind"));
  const notes = String(form.get("notes") || "").trim();
  if (amountCents <= 0 || !["OWNER_DEPOSIT", "OWNER_WITHDRAWAL"].includes(kind) || !notes) throw new Error("Enter a positive amount and a reason");
  await prisma.$transaction(async (tx) => {
    const { user, session } = await cashContext(tx);
    if (user.role !== "admin") throw new Error("Administrator required");
    const movement = await tx.cashMovement.create({ data: {
      sourceKey: randomUUID(), amountCents: amountCents * (kind === "OWNER_DEPOSIT" ? 1 : -1),
      kind, reference: `SESSION-${session.id}`, notes, sessionId: session.id, userId: user.id,
    } });
    await tx.auditLog.create({ data: { action: kind, entity: "CashMovement", entityId: movement.id, userId: user.id, detail: notes } });
  });
  refresh();
}

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "./auth";

type Tx = Prisma.TransactionClient;

export function cents(value: number) {
  const result = Math.round(value * 100);
  if (!Number.isFinite(value) || !Number.isSafeInteger(result) || Math.abs(result) > 2147483647 || Math.abs(value * 100 - result) > 0.000001)
    throw new Error("Invalid cash amount");
  return result;
}

export async function requireCashUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

export async function cashBalance(tx: Tx) {
  const book = await tx.cashbook.findUnique({ where: { id: 1 } });
  const sum = await tx.cashMovement.aggregate({ _sum: { amountCents: true } });
  return (book?.baselineCents ?? 0) + (sum._sum.amountCents ?? 0);
}

export async function cashContext(tx: Tx) {
  const user = await requireCashUser();
  const book = await tx.cashbook.findUnique({ where: { id: 1 } });
  const session = await tx.cashSession.findUnique({ where: { openKey: 1 } });
  if (!book || !session) throw new Error("Initialize the caisse and open a session before recording money");
  if (session.openedAt.toDateString() !== new Date().toDateString())
    throw new Error("Close the previous day's caisse session before recording money");
  return { user, session };
}

export async function recordPaymentCash(tx: Tx, payment: { id: number; ref: string; type: string; amount: number; method: string }) {
  if (payment.method !== "cash" || !(payment.amount > 0)) throw new Error("Only positive cash payments are allowed");
  const { user, session } = await cashContext(tx);
  return tx.cashMovement.create({ data: {
    sourceKey: `payment:${payment.id}`, amountCents: cents(payment.amount) * (payment.type === "SALE" ? 1 : -1),
    kind: payment.type === "SALE" ? "CUSTOMER_PAYMENT" : "SUPPLIER_PAYMENT", reference: payment.ref,
    paymentId: payment.id, sessionId: session.id, userId: user.id,
  } });
}

export async function recordExpenseCash(tx: Tx, expense: { id: number; ref: string; amount: number }) {
  const { user, session } = await cashContext(tx);
  return tx.cashMovement.create({ data: {
    sourceKey: `expense:${expense.id}:${randomUUID()}`, amountCents: -cents(expense.amount),
    kind: "EXPENSE", reference: expense.ref, expenseId: expense.id, sessionId: session.id, userId: user.id,
  } });
}

export async function reverseCash(tx: Tx, where: { paymentId?: number; expenseId?: number }, reason: string) {
  const { user, session } = await cashContext(tx);
  const movements = await tx.cashMovement.findMany({ where: { ...where, reversalOfId: null, reversal: null } });
  if (!movements.length) return;
  for (const movement of movements) {
    await tx.cashMovement.create({ data: {
      sourceKey: `reversal:${movement.id}`, amountCents: -movement.amountCents, kind: "REVERSAL",
      reference: movement.reference, notes: reason, paymentId: movement.paymentId, expenseId: movement.expenseId,
      reversalOfId: movement.id, sessionId: session.id, userId: user.id,
    } });
  }
}

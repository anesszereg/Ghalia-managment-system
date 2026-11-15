"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { deliverSaleEmail, queueSaleEmail, saleEmailConfigured } from "./sale-email";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { createSession, destroySession, getSessionUser, requireAdminUser, requireSessionUser } from "./auth";
import { nextRef } from "./utils";
import { cashContext, cents, recordPaymentCash, recordExpenseCash, reverseCash, requireCashUser } from "./caisse";

/* ------------------------------- AUTH ---------------------------------- */

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    redirect("/login?error=1");
  }
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

async function audit(
  tx: any,
  action: string,
  entity: string,
  entityId: number,
  detail = ""
) {
  const user = await getSessionUser();
  await tx.auditLog.create({
    data: { action, entity, entityId, detail, userId: user?.id },
  });
}

/* ----------------------------- SETTINGS -------------------------------- */

function suppliedFields<T extends Record<string, unknown>>(formData: FormData, data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => formData.has(key))) as Partial<T>;
}

export async function saveSettingsAction(formData: FormData) {
  await requireAdminUser();
  const data = suppliedFields(formData, {
      showroomName: String(formData.get("showroomName") || ""),
      logoUrl: String(formData.get("logoUrl") || ""),
      address: String(formData.get("address") || ""),
      phone: String(formData.get("phone") || ""),
      currency: String(formData.get("currency") || "DZD"),
      receiptFooter: String(formData.get("receiptFooter") || ""),
      salePrefix: String(formData.get("salePrefix") || "SAL-"),
      purchasePrefix: String(formData.get("purchasePrefix") || "PUR-"),
      paymentPrefix: String(formData.get("paymentPrefix") || "PAY-"),
      expensePrefix: String(formData.get("expensePrefix") || "EXP-"),
      taxRate: parseFloat(String(formData.get("taxRate") || "0")) || 0,
      lowStockDefault: parseInt(String(formData.get("lowStockDefault") || "3")) || 3,
  });
  await prisma.setting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/settings");
  revalidatePath("/");
  redirect("/settings?saved=1");
}

export async function createUserAction(formData: FormData) {
  await requireAdminUser();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "");
  const role = String(formData.get("role") || "staff");
  const password = String(formData.get("password") || "");
  if (!email || !password) redirect("/settings?error=user");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { email, name, role, passwordHash } });
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function deleteUserAction(formData: FormData) {
  await requireAdminUser();
  const id = parseInt(String(formData.get("id")));
  const me = await getSessionUser();
  if (me?.id === id) redirect("/settings?error=self");
  await prisma.user.delete({ where: { id } });
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

/* --------------------------- PRODUCTS ---------------------------------- */

function productData(formData: FormData) {
  return {
    sku: String(formData.get("sku") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    category: String(formData.get("category") || "Other products"),
    purchasePrice: parseFloat(String(formData.get("purchasePrice") || "0")) || 0,
    sellingPrice: parseFloat(String(formData.get("sellingPrice") || "0")) || 0,
    ...suppliedFields(formData, {
      imageUrl: String(formData.get("imageUrl") || ""),
      description: String(formData.get("description") || ""),
      minStock: parseInt(String(formData.get("minStock") || "3")) || 0,
      dimensions: String(formData.get("dimensions") || ""),
      supplierId: formData.get("supplierId") ? parseInt(String(formData.get("supplierId"))) : null,
    }),
  };
}

export async function createProductAction(formData: FormData) {
  await requireSessionUser();
  const data = productData(formData);
  if (!data.sku || !data.name) redirect("/products/new?error=1");
  const stock = parseInt(String(formData.get("stock") || "0")) || 0;
  try {
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({ data: { ...data, stock } });
      if (stock !== 0) {
        await tx.stockMovement.create({
          data: {
            productId: p.id,
            type: "ADJUST",
            qty: stock,
            reason: "Initial stock",
            balanceAfter: stock,
          },
        });
      }
      await audit(tx, "CREATE", "Product", p.id, p.name);
      return p;
    });
    revalidatePath("/products");
    redirect(`/products/${product.id}`);
  } catch (e: any) {
    if (e?.message?.includes("NEXT_REDIRECT")) throw e;
    redirect("/products/new?error=sku");
  }
}

export async function updateProductAction(formData: FormData) {
  await requireSessionUser();
  const id = parseInt(String(formData.get("id")));
  const data = productData(formData);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });
      await audit(tx, "UPDATE", "Product", id, data.name);
    });
  } catch (e: any) {
    if (e?.message?.includes("NEXT_REDIRECT")) throw e;
    redirect(`/products/${id}/edit?error=sku`);
  }
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
}

export async function deleteProductAction(formData: FormData) {
  await requireSessionUser();
  const id = parseInt(String(formData.get("id")));
  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.deleteMany({ where: { productId: id } });
    await tx.saleItem.updateMany({ where: { productId: id }, data: { productId: null } });
    await tx.purchaseItem.updateMany({ where: { productId: id }, data: { productId: null } });
    await tx.product.delete({ where: { id } });
    await audit(tx, "DELETE", "Product", id);
  });
  revalidatePath("/products");
  redirect("/products");
}

export async function adjustStockAction(formData: FormData) {
  await requireSessionUser();
  const id = parseInt(String(formData.get("id")));
  const qty = parseInt(String(formData.get("qty") || "0"));
  const reason = String(formData.get("reason") || "Manual adjustment");
  if (!qty) redirect(`/products/${id}?error=qty`);
  await prisma.$transaction(async (tx) => {
    const p = await tx.product.update({
      where: { id },
      data: { stock: { increment: qty } },
    });
    await tx.stockMovement.create({
      data: { productId: id, type: "ADJUST", qty, reason, balanceAfter: p.stock },
    });
    await audit(tx, "STOCK_ADJUST", "Product", id, `${qty > 0 ? "+" : ""}${qty}: ${reason}`);
  });
  revalidatePath(`/products/${id}`);
  revalidatePath("/products");
  redirect(`/products/${id}?saved=1`);
}

/* ------------------------- CUSTOMERS / SUPPLIERS ----------------------- */

export async function saveCustomerAction(formData: FormData) {
  await requireSessionUser();
  const id = formData.get("id") ? parseInt(String(formData.get("id"))) : null;
  const data = {
    name: String(formData.get("name") || "").trim(),
    ...suppliedFields(formData, {
      phone: String(formData.get("phone") || ""),
      address: String(formData.get("address") || ""),
      email: String(formData.get("email") || ""),
      notes: String(formData.get("notes") || ""),
    }),
  };
  if (!data.name) redirect("/customers?error=1");
  if (id) await prisma.customer.update({ where: { id }, data });
  else await prisma.customer.create({ data });
  revalidatePath("/customers");
  redirect("/customers?saved=1");
}

export async function deleteCustomerAction(formData: FormData) {
  await requireSessionUser();
  const id = parseInt(String(formData.get("id")));
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
  redirect("/customers");
}

export async function saveSupplierAction(formData: FormData) {
  await requireSessionUser();
  const id = formData.get("id") ? parseInt(String(formData.get("id"))) : null;
  const data = {
    name: String(formData.get("name") || "").trim(),
    ...suppliedFields(formData, {
      phone: String(formData.get("phone") || ""),
      address: String(formData.get("address") || ""),
      email: String(formData.get("email") || ""),
      notes: String(formData.get("notes") || ""),
    }),
  };
  if (!data.name) redirect("/suppliers?error=1");
  const openingBalance = id ? 0 : Number(formData.get("openingBalance") || 0);
  if (openingBalance < 0) throw new Error("Opening balance must be zero or positive");
  cents(openingBalance);
  await prisma.$transaction(async tx => {
    const supplier = id ? await tx.supplier.update({ where: { id }, data }) : await tx.supplier.create({ data: { ...data, openingBalance } });
    await audit(tx, id ? "UPDATE" : "CREATE", "Supplier", supplier.id, `${supplier.name}; opening balance=${supplier.openingBalance}`);
  });
  revalidatePath("/", "layout");
  revalidatePath("/suppliers");
  redirect("/suppliers?saved=1");
}

export async function deleteSupplierAction(formData: FormData) {
  await requireSessionUser();
  const id = parseInt(String(formData.get("id")));
  await prisma.$transaction(async tx => {
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id } });
    if (supplier.openingBalance > 0) throw new Error("Suppliers with opening-balance history cannot be deleted");
    await tx.supplier.delete({ where: { id } });
  });
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

/* -------------------------------- SALES --------------------------------- */

export async function createSaleAction(formData: FormData) {
  await requireCashUser();
  const payload = JSON.parse(String(formData.get("payload") || "{}"));
  if (payload.paymentMethod && payload.paymentMethod !== "cash") throw new Error("Cash only");
  if (!Number.isFinite(payload.paid ?? 0) || (payload.paid ?? 0) < 0) throw new Error("Invalid payment");
  cents(payload.paid ?? 0);
  if (payload.paid > 0) await prisma.$transaction(cashContext);
  const items: { productId: number; qty: number; unitPrice: number }[] =
    payload.items || [];
  if (!items.length) redirect("/sales/new?error=items");

  const sale = await prisma.$transaction(async (tx) => {
    const ref = await nextRef(tx, "sale");
    let subtotal = 0;
    const lineItems = [];
    for (const it of items) {
      if (!Number.isSafeInteger(it.qty) || it.qty <= 0 || !Number.isFinite(it.unitPrice) || it.unitPrice < 0) throw new Error("Invalid line item");
      cents(it.unitPrice);
      const product = await tx.product.findUnique({ where: { id: it.productId } });
      if (!product) throw new Error("Product not found");
      if (product.stock < it.qty)
        throw new Error(`Insufficient stock for ${product.name}`);
      const total = it.qty * it.unitPrice;
      subtotal += total;
      lineItems.push({
        productId: product.id,
        name: product.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        costPrice: product.purchasePrice,
        total,
      });
    }
    const discount = payload.discount ?? 0;
    if (!Number.isFinite(discount) || discount < 0) throw new Error("Invalid discount");
    cents(discount);
    const total = Math.round(Math.max(0, subtotal - discount) * 100) / 100;
    const paid = Math.min(payload.paid || 0, total);

    const sale = await tx.sale.create({
      data: {
        ref,
        customerId: payload.customerId || null,
        customerName: payload.customerName || "",
        customerPhone: payload.customerPhone || "",
        date: payload.date ? new Date(payload.date) : new Date(),
        discount,
        total,
        paid,
        paymentMethod: payload.paymentMethod || "cash",
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        notes: payload.notes || "",
        items: { create: lineItems },
      },
    });

    for (const li of lineItems) {
      const p = await tx.product.update({
        where: { id: li.productId! },
        data: { stock: { decrement: li.qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: li.productId!,
          type: "SALE",
          qty: -li.qty,
          ref,
          reason: `Sale ${ref}`,
          balanceAfter: p.stock,
        },
      });
    }

    if (paid > 0) {
      const payRef = await nextRef(tx, "payment");
      const payment = await tx.payment.create({
        data: {
          ref: payRef,
          type: "SALE",
          saleId: sale.id,
          customerId: sale.customerId,
          amount: paid,
          method: sale.paymentMethod,
          date: sale.date,
          notes: `Initial payment for ${ref}`,
        },
      });
      await recordPaymentCash(tx, payment);
    }
    await audit(tx, "CREATE", "Sale", sale.id, `${ref} total=${total}`);
    await queueSaleEmail(tx, sale, lineItems);
    return sale;
  }).catch(() => null);

  if (!sale) redirect("/sales/new?error=stock");
  if (saleEmailConfigured()) after(async () => {
    try { await deliverSaleEmail(sale.id); }
    catch { console.error("Sale email delivery could not complete; notification remains queued.", { saleId: sale.id }); }
  });
  revalidatePath("/", "layout");
  revalidatePath("/sales");
  revalidatePath("/products");
  redirect(`/sales/${sale.id}`);
}

async function voidSaleTransaction(id: number, cashConfirmed: unknown, status: "cancelled" | "deleted", reason: string) {
  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale || sale.status !== "confirmed") return;
    if (sale.paid > 0 && cashConfirmed !== "yes") throw new Error("Confirm the cash return or correction");
    for (const it of sale.items) {
      if (!it.productId) continue;
      const p = await tx.product.update({
        where: { id: it.productId },
        data: { stock: { increment: it.qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          type: "SALE_CANCEL",
          qty: it.qty,
          ref: sale.ref,
          reason: `${reason} of ${sale.ref}`,
          balanceAfter: p.stock,
        },
      });
    }
    const payments = await tx.payment.findMany({ where: { saleId: id, voided: false } });
    for (const payment of payments) await reverseCash(tx, { paymentId: payment.id }, `Sale ${status}: cash returned to customer`);
    await tx.sale.update({ where: { id }, data: { status, paid: 0 } });
    await tx.payment.updateMany({ where: { saleId: id }, data: { voided: true } });
    await audit(tx, status === "deleted" ? "DELETE" : "CANCEL", "Sale", id, sale.ref);
  });
}

export async function cancelSaleAction(formData: FormData) {
  await requireCashUser();
  const id = parseInt(String(formData.get("id")));
  await voidSaleTransaction(id, formData.get("cashConfirmed"), "cancelled", "Cancellation");
  revalidatePath("/", "layout");
  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  redirect(`/sales/${id}`);
}

export async function deleteSaleAction(formData: FormData) {
  await requireAdminUser();
  const id = parseInt(String(formData.get("id")));
  const sale = await prisma.sale.findUnique({ where: { id }, select: { paid: true } });
  if (sale?.paid && sale.paid > 0) await prisma.$transaction(cashContext);
  await voidSaleTransaction(id, formData.get("cashConfirmed"), "deleted", "Deletion");
  revalidatePath("/", "layout");
  revalidatePath("/sales");
  redirect("/sales");
}

/* ------------------------------ PURCHASES ------------------------------- */

export async function createPurchaseAction(formData: FormData) {
  await requireCashUser();
  const payload = JSON.parse(String(formData.get("payload") || "{}"));
  if (payload.paymentMethod && payload.paymentMethod !== "cash") throw new Error("Cash only");
  if (!Number.isFinite(payload.paid ?? 0) || (payload.paid ?? 0) < 0) throw new Error("Invalid payment");
  cents(payload.paid ?? 0);
  if (payload.paid > 0) await prisma.$transaction(cashContext);
  const items: { productId: number; qty: number; unitPrice: number }[] =
    payload.items || [];
  if (!items.length) redirect("/purchases/new?error=items");

  const purchase = await prisma.$transaction(async (tx) => {
    const ref = await nextRef(tx, "purchase");
    let total = 0;
    const lineItems = [];
    for (const it of items) {
      if (!Number.isSafeInteger(it.qty) || it.qty <= 0 || !Number.isFinite(it.unitPrice) || it.unitPrice < 0) throw new Error("Invalid line item");
      cents(it.unitPrice);
      const product = await tx.product.findUnique({ where: { id: it.productId } });
      if (!product) throw new Error("Product not found");
      const lineTotal = it.qty * it.unitPrice;
      total += lineTotal;
      lineItems.push({
        productId: product.id,
        name: product.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        total: lineTotal,
      });
    }
    total = Math.round(total * 100) / 100;
    const paid = Math.min(payload.paid || 0, total);
    const purchase = await tx.purchase.create({
      data: {
        ref,
        supplierId: payload.supplierId || null,
        supplierName: payload.supplierName || "",
        date: payload.date ? new Date(payload.date) : new Date(),
        total,
        paid,
        paymentMethod: payload.paymentMethod || "cash",
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        notes: payload.notes || "",
        items: { create: lineItems },
      },
    });

    for (const li of lineItems) {
      const p = await tx.product.update({
        where: { id: li.productId! },
        data: {
          stock: { increment: li.qty },
          purchasePrice: li.unitPrice, // update latest cost
        },
      });
      await tx.stockMovement.create({
        data: {
          productId: li.productId!,
          type: "PURCHASE",
          qty: li.qty,
          ref,
          reason: `Purchase ${ref}`,
          balanceAfter: p.stock,
        },
      });
    }

    if (paid > 0) {
      const payRef = await nextRef(tx, "payment");
      const payment = await tx.payment.create({
        data: {
          ref: payRef,
          type: "PURCHASE",
          purchaseId: purchase.id,
          supplierId: purchase.supplierId,
          amount: paid,
          method: purchase.paymentMethod,
          date: purchase.date,
          notes: `Initial payment for ${ref}`,
        },
      });
      await recordPaymentCash(tx, payment);
    }
    await audit(tx, "CREATE", "Purchase", purchase.id, `${ref} total=${total}`);
    return purchase;
  }).catch(() => null);

  if (!purchase) redirect("/purchases/new?error=1");
  revalidatePath("/", "layout");
  revalidatePath("/purchases");
  revalidatePath("/products");
  redirect(`/purchases/${purchase.id}`);
}

export async function cancelPurchaseAction(formData: FormData) {
  await requireCashUser();
  const id = parseInt(String(formData.get("id")));
  const ok = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!purchase || purchase.status === "cancelled") return true;
    if (purchase.paid > 0 && formData.get("cashConfirmed") !== "yes") throw new Error("Confirm the cash return or correction");
    const quantities = new Map<number, number>();
    for (const item of purchase.items) if (item.productId) quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.qty);
    for (const [productId, qty] of quantities) {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product || product.stock < qty) return false;
    }
    for (const it of purchase.items) {
      if (!it.productId) continue;
      const prod = await tx.product.findUnique({ where: { id: it.productId } });
      if (!prod || prod.stock < it.qty) return false; // stock already sold
      const p = await tx.product.update({
        where: { id: it.productId },
        data: { stock: { decrement: it.qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          type: "PURCHASE_CANCEL",
          qty: -it.qty,
          ref: purchase.ref,
          reason: `Cancellation of ${purchase.ref}`,
          balanceAfter: p.stock,
        },
      });
    }
    const payments = await tx.payment.findMany({ where: { purchaseId: id, voided: false } });
    for (const payment of payments) await reverseCash(tx, { paymentId: payment.id }, "Purchase cancelled: cash refunded by supplier");
    await tx.purchase.update({ where: { id }, data: { status: "cancelled", paid: 0 } });
    await tx.payment.updateMany({ where: { purchaseId: id }, data: { voided: true } });
    await audit(tx, "CANCEL", "Purchase", id, purchase.ref);
    return true;
  });
  if (!ok) redirect(`/purchases/${id}?error=stock`);
  revalidatePath("/", "layout");
  revalidatePath("/purchases");
  redirect(`/purchases/${id}`);
}

/* ------------------------------- PAYMENTS ------------------------------- */

export async function addPaymentAction(formData: FormData) {
  await requireCashUser();
  const type = String(formData.get("type")); // SALE | PURCHASE
  const txnId = parseInt(String(formData.get("txnId")));
  const amount = parseFloat(String(formData.get("amount") || "0"));
  const method = String(formData.get("method") || "cash");
  const date = formData.get("date") ? new Date(String(formData.get("date"))) : new Date();
  const notes = String(formData.get("notes") || "");
  if (!["SALE", "PURCHASE"].includes(type) || method !== "cash" || !Number.isFinite(amount) || Number.isNaN(date.getTime())) throw new Error("Invalid cash payment");
  cents(amount);
  if (!(amount > 0)) redirect(type === "SALE" ? `/sales/${txnId}` : `/purchases/${txnId}`);

  const result = await prisma.$transaction(async (tx) => {
    if (type === "SALE") {
      const sale = await tx.sale.findUnique({ where: { id: txnId } });
      if (!sale || sale.status === "cancelled") return null;
      const remaining = sale.total - sale.paid;
      const amt = Math.round(Math.min(amount, remaining) * 100) / 100;
      if (!(amt > 0)) return null;
      const ref = await nextRef(tx, "payment");
      const payment = await tx.payment.create({
        data: {
          ref,
          type: "SALE",
          saleId: txnId,
          customerId: sale.customerId,
          amount: amt,
          method,
          date,
          notes,
        },
      });
      await recordPaymentCash(tx, payment);
      await tx.sale.update({ where: { id: txnId }, data: { paid: { increment: amt } } });
      await audit(tx, "PAYMENT", "Sale", txnId, `${ref} +${amt}`);
      return { payment, redirect: `/sales/${txnId}` };
    } else {
      const purchase = await tx.purchase.findUnique({ where: { id: txnId } });
      if (!purchase || purchase.status === "cancelled") return null;
      const remaining = purchase.total - purchase.paid;
      const amt = Math.round(Math.min(amount, remaining) * 100) / 100;
      if (!(amt > 0)) return null;
      const ref = await nextRef(tx, "payment");
      const payment = await tx.payment.create({
        data: {
          ref,
          type: "PURCHASE",
          purchaseId: txnId,
          supplierId: purchase.supplierId,
          amount: amt,
          method,
          date,
          notes,
        },
      });
      await recordPaymentCash(tx, payment);
      await tx.purchase.update({ where: { id: txnId }, data: { paid: { increment: amt } } });
      await audit(tx, "PAYMENT", "Purchase", txnId, `${ref} +${amt}`);
      return { payment, redirect: `/purchases/${txnId}` };
    }
  });
  if (result) {
    revalidatePath("/", "layout");
    revalidatePath("/payments");
    revalidatePath(result.redirect);
    redirect(`${result.redirect}?paid=1`);
  }
  redirect("/payments");
}

export async function paySupplierOpeningBalanceAction(formData: FormData) {
  await requireCashUser();
  const supplierId = Number(formData.get("txnId"));
  const amount = Number(formData.get("amount"));
  if (!Number.isSafeInteger(supplierId) || supplierId < 1 || amount <= 0) throw new Error("Invalid opening-balance payment");
  const amountCents = cents(amount);
  await prisma.$transaction(async tx => {
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const previous = await tx.payment.aggregate({ where: { supplierId, supplierOpening: true, voided: false }, _sum: { amount: true } });
    const remaining = cents(supplier.openingBalance) - cents(previous._sum.amount || 0);
    if (remaining <= 0) return;
    const paid = Math.min(amountCents, remaining) / 100;
    const ref = await nextRef(tx, "payment");
    const payment = await tx.payment.create({ data: { ref, type: "PURCHASE", supplierId, supplierOpening: true, amount: paid, method: "cash", notes: "Supplier opening-balance payment" } });
    await recordPaymentCash(tx, payment);
    await audit(tx, "PAYMENT", "Supplier", supplierId, `${ref} opening balance payment=${paid}`);
  });
  revalidatePath("/", "layout");
  redirect(`/suppliers/${supplierId}?paid=1`);
}

export async function voidPaymentAction(formData: FormData) {
  await requireCashUser();
  if (formData.get("cashConfirmed") !== "yes") throw new Error("Confirm the cash return or correction");
  const id = parseInt(String(formData.get("id")));
  await prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id } });
    if (!p || p.voided) return;
    await reverseCash(tx, { paymentId: id }, "Payment voided: cash correction / return");
    await tx.payment.update({ where: { id }, data: { voided: true } });
    if (p.saleId)
      await tx.sale.update({
        where: { id: p.saleId },
        data: { paid: { decrement: p.amount } },
      });
    if (p.purchaseId)
      await tx.purchase.update({
        where: { id: p.purchaseId },
        data: { paid: { decrement: p.amount } },
      });
    await audit(tx, "VOID", "Payment", id, p.ref);
  });
  revalidatePath("/", "layout");
  revalidatePath("/payments");
  redirect("/payments");
}

/* ------------------------------- EXPENSES ------------------------------- */

export async function saveExpenseAction(formData: FormData) {
  const id = formData.get("id") ? parseInt(String(formData.get("id"))) : null;
  const data = {
    category: String(formData.get("category") || "Other"),
    amount: parseFloat(String(formData.get("amount") || "0")) || 0,
    method: String(formData.get("method") || "cash"),
    ...suppliedFields(formData, {
      date: formData.get("date") ? new Date(String(formData.get("date"))) : new Date(),
      notes: String(formData.get("notes") || ""),
    }),
  };
  await requireCashUser();
  if (!Number.isFinite(data.amount) || data.method !== "cash" || (data.date && Number.isNaN(data.date.getTime()))) throw new Error("Invalid cash expense");
  if (!(data.amount > 0)) redirect("/expenses?error=1");
  await prisma.$transaction(async (tx) => {
    if (id) await reverseCash(tx, { expenseId: id }, "Expense corrected");
    const expense = id
      ? await tx.expense.update({ where: { id }, data })
      : await tx.expense.create({ data: { ...data, ref: await nextRef(tx, "expense") } });
    await recordExpenseCash(tx, expense);
    await audit(tx, id ? "UPDATE" : "CREATE", "Expense", expense.id, expense.ref);
  });
  revalidatePath("/", "layout");
  revalidatePath("/expenses");
  redirect("/expenses?saved=1");
}

export async function deleteExpenseAction(formData: FormData) {
  const id = parseInt(String(formData.get("id")));
  await requireCashUser();
  if (formData.get("cashConfirmed") !== "yes") throw new Error("Confirm the cash refund or correction");
  await prisma.$transaction(async (tx) => {
    await reverseCash(tx, { expenseId: id }, "Expense deleted: cash correction / refund");
    await tx.expense.delete({ where: { id } });
    await audit(tx, "DELETE", "Expense", id);
  });
  revalidatePath("/", "layout");
  revalidatePath("/expenses");
  redirect("/expenses");
}

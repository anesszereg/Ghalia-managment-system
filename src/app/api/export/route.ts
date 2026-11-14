import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function csv(rows: any[][]): string {
  return rows
    .map((r) =>
      r.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(",")
    )
    .join("\n");
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "sales";
  const from = new Date((req.nextUrl.searchParams.get("from") || "2000-01-01") + "T00:00:00");
  const to = new Date((req.nextUrl.searchParams.get("to") || "2100-01-01") + "T23:59:59");

  let header: string[] = [];
  let rows: any[][] = [];

  if (type === "sales") {
    const data = await prisma.sale.findMany({
      where: { date: { gte: from, lte: to } },
      include: { customer: true },
      orderBy: { date: "asc" },
    });
    header = ["Ref", "Date", "Customer", "Total", "Paid", "Balance", "Status", "Method"];
    rows = data.map((s) => [s.ref, s.date.toISOString().slice(0, 10), s.customer?.name || s.customerName, s.total, s.paid, s.total - s.paid, s.status, s.paymentMethod]);
  } else if (type === "purchases") {
    const data = await prisma.purchase.findMany({
      where: { date: { gte: from, lte: to } },
      include: { supplier: true },
      orderBy: { date: "asc" },
    });
    header = ["Ref", "Date", "Supplier", "Total", "Paid", "Balance", "Status"];
    rows = data.map((p) => [p.ref, p.date.toISOString().slice(0, 10), p.supplier?.name || p.supplierName, p.total, p.paid, p.total - p.paid, p.status]);
  } else if (type === "payments") {
    const data = await prisma.payment.findMany({
      where: { date: { gte: from, lte: to }, voided: false },
      include: { sale: true, purchase: true, customer: true, supplier: true },
      orderBy: { date: "asc" },
    });
    header = ["Ref", "Date", "Type", "Transaction", "Party", "Method", "Amount"];
    rows = data.map((p) => [p.ref, p.date.toISOString().slice(0, 10), p.type, p.sale?.ref || p.purchase?.ref || "", p.customer?.name || p.supplier?.name || "", p.method, p.amount]);
  } else if (type === "caisse") {
    const data = await prisma.cashMovement.findMany({ where: { date: { gte: from, lte: to } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    header = ["ID", "Date", "Reference", "Type", "In", "Out", "Session", "Historical", "Reversal of", "User", "Notes"];
    rows = data.map(m => [m.id, m.date.toISOString(), m.reference, m.kind, Math.max(0, m.amountCents) / 100, Math.max(0, -m.amountCents) / 100, m.sessionId, m.historical, m.reversalOfId, m.userId, m.notes]);
  } else if (type === "expenses") {
    const data = await prisma.expense.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
    });
    header = ["Ref", "Date", "Category", "Method", "Notes", "Amount"];
    rows = data.map((e) => [e.ref, e.date.toISOString().slice(0, 10), e.category, e.method, e.notes, e.amount]);
  } else if (type === "inventory") {
    const data = await prisma.product.findMany({ orderBy: { name: "asc" } });
    header = ["SKU", "Name", "Category", "Stock", "Min stock", "Purchase price", "Selling price", "Stock value"];
    rows = data.map((p) => [p.sku, p.name, p.category, p.stock, p.minStock, p.purchasePrice, p.sellingPrice, p.stock * p.purchasePrice]);
  } else if (type === "debts") {
    const sales: any = await prisma.$queryRaw`
      SELECT 'Customer' kind, COALESCE(c.name, s."customerName", 'Walk-in') name, s.ref, (s.total-s.paid) balance, s."dueDate" due
      FROM "Sale" s LEFT JOIN "Customer" c ON c.id=s."customerId" WHERE s.status='confirmed' AND s.paid < s.total`;
    const purchases: any = await prisma.$queryRaw`
      SELECT 'Supplier' kind, COALESCE(su.name, p."supplierName") name, p.ref, (p.total-p.paid) balance, p."dueDate" due
      FROM "Purchase" p LEFT JOIN "Supplier" su ON su.id=p."supplierId" WHERE p.status='confirmed' AND p.paid < p.total`;
    header = ["Type", "Name", "Ref", "Balance", "Due date"];
    rows = [...sales, ...purchases].map((d: any) => [d.kind, d.name, d.ref, Number(d.balance), d.due ? new Date(d.due).toISOString().slice(0, 10) : ""]);
  }

  const body = "\uFEFF" + csv([header, ...rows]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-report.csv"`,
    },
  });
}

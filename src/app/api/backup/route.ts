import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const backup = {
    exportedAt: new Date().toISOString(),
    settings: await prisma.setting.findMany(),
    users: (await prisma.user.findMany()).map(({ passwordHash, ...u }) => u),
    customers: await prisma.customer.findMany(),
    suppliers: await prisma.supplier.findMany(),
    products: await prisma.product.findMany(),
    sales: await prisma.sale.findMany({ include: { items: true } }),
    purchases: await prisma.purchase.findMany({ include: { items: true } }),
    payments: await prisma.payment.findMany(),
    expenses: await prisma.expense.findMany(),
    cashbook: await prisma.cashbook.findMany(),
    cashSessions: await prisma.cashSession.findMany(),
    cashMovements: await prisma.cashMovement.findMany(),
    stockMovements: await prisma.stockMovement.findMany(),
  };

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="showroom-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

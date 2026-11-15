import { prisma } from "./db";
import { cents } from "./caisse";

export async function supplierOpeningDebts() {
  const suppliers = await prisma.supplier.findMany({
    where: { openingBalance: { gt: 0 } },
    include: { payments: { where: { supplierOpening: true, voided: false }, select: { amount: true } } },
  });
  return suppliers.map(supplier => {
    const paidCents = supplier.payments.reduce((sum, p) => sum + cents(p.amount), 0);
    return { supplierId: supplier.id, name: supplier.name, ref: `OPENING-SUP-${supplier.id}`, total: supplier.openingBalance, paid: paidCents / 100, balance: Math.max(0, cents(supplier.openingBalance) - paidCents) / 100, dueDate: null };
  });
}

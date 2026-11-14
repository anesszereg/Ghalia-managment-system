import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/utils";
import TransactionForm from "@/components/TransactionForm";

export default async function NewPurchase({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const settings = await getSettings();
  const session = await prisma.cashSession.findUnique({ where: { openKey: 1 } });
  const cashReady = session?.openedAt.toDateString() === new Date().toDateString();
  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy-950">New purchase</h1>
      {error && (
        <div className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">
          Please add at least one product.
        </div>
      )}
      <TransactionForm
        mode="purchase"
        cashReady={cashReady}
        currency={settings.currency}
        products={products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, category: p.category, stock: p.stock, sellingPrice: p.sellingPrice, purchasePrice: p.purchasePrice }))}
        parties={suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone }))}
      />
    </div>
  );
}

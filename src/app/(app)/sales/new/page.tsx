import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/utils";
import TransactionForm from "@/components/TransactionForm";

export const maxDuration = 60;

export default async function NewSale({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const settings = await getSettings();
  const session = await prisma.cashSession.findUnique({ where: { openKey: 1 } });
  const cashReady = session?.openedAt.toDateString() === new Date().toDateString();
  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold text-navy-950">New sale · Vente comptoir</h1><p className="mt-1 text-sm text-slate-500">Sell directly to the public. No customer record needed.</p></div>
      {error && (
        <div className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">
          {error === "stock" ? "Insufficient stock for one or more products." : "Please add at least one product."}
        </div>
      )}
      <TransactionForm
        mode="sale"
        cashReady={cashReady}
        currency={settings.currency}
        products={products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, category: p.category, stock: p.stock, sellingPrice: p.sellingPrice, purchasePrice: p.purchasePrice }))}
        parties={[]}
      />
    </div>
  );
}

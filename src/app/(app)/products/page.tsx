import Link from "next/link";
import { prisma, textContains } from "@/lib/db";
import { fmt, getSettings, CATEGORIES } from "@/lib/utils";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const q = sp.q || "";
  const category = sp.category || "";
  const lowOnly = sp.filter === "low";

  let products;
  if (lowOnly) {
    products = await prisma.$queryRaw`
      SELECT p.*, s.name as "supplierName" FROM "Product" p LEFT JOIN "Supplier" s ON s.id=p."supplierId"
      WHERE p.stock <= p."minStock" ORDER BY p.stock` as any[];
  } else {
    products = await prisma.product.findMany({
      where: {
        AND: [
          q ? { OR: [{ name: textContains(q) }, { sku: textContains(q) }] } : {},
          category ? { category } : {},
        ],
      },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
    }) as any[];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy-950">Products & Inventory</h1>
        <Link href="/products/new" className="btn-accent">+ New product</Link>
      </div>

      <form className="card p-4 flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-48">
          <label className="label">Search</label>
          <input name="q" defaultValue={q} placeholder="Name or SKU..." className="input" />
        </div>
        <div>
          <label className="label">Category</label>
          <select name="category" defaultValue={category} className="input !w-auto">
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" name="filter" value="low" defaultChecked={lowOnly} /> Low stock only
        </label>
        <button className="btn-ghost">Apply filters</button>
        {(q || category || lowOnly) && <Link href="/products" className="py-3 text-sm text-slate-500 underline">Clear filters</Link>}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr>
              <th className="th">Product</th>
              <th className="th">SKU</th>
              <th className="th">Category</th>
              <th className="th">Purchase price</th>
              <th className="th">Selling price</th>
              <th className="th">Margin</th>
              <th className="th">Stock</th>
              <th className="th">Supplier</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p: any) => {
              const low = p.stock <= p.minStock;
              const margin = p.purchasePrice > 0
                ? (((p.sellingPrice - p.purchasePrice) / p.purchasePrice) * 100).toFixed(0) + "%"
                : "—";
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="td font-medium text-navy-900">
                    <Link href={`/products/${p.id}`} className="hover:underline">{p.name}</Link>
                  </td>
                  <td className="td text-slate-500">{p.sku}</td>
                  <td className="td">{p.category}</td>
                  <td className="td">{fmt(p.purchasePrice, settings.currency)}</td>
                  <td className="td">{fmt(p.sellingPrice, settings.currency)}</td>
                  <td className="td text-emerald-600 font-medium">{margin}</td>
                  <td className="td">
                    <span className={`badge ${low ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="td text-slate-500">{p.supplier?.name || p.supplierName || "—"}</td>
                  <td className="td text-right">
                    <Link href={`/products/${p.id}`} className="text-sm text-emerald-600 font-medium">Open →</Link>
                  </td>
                </tr>
              );
            })}
            {!products.length && (
              <tr><td colSpan={9} className="td text-center text-slate-400 py-8">No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

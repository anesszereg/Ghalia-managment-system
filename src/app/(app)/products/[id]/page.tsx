import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmt, fmtDateTime, getSettings } from "@/lib/utils";
import { adjustStockAction, deleteProductAction } from "@/lib/actions";

export default async function ProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const settings = await getSettings();
  const product = await prisma.product.findUnique({
    where: { id: Number(id) },
    include: {
      supplier: true,
      movements: { orderBy: { date: "desc" }, take: 50 },
    },
  });
  if (!product) notFound();
  const low = product.stock <= product.minStock;
  const margin = product.sellingPrice - product.purchasePrice;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-950">{product.name}</h1>
          <p className="text-sm text-slate-500">{product.sku} · {product.category}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/products/${product.id}/edit`} className="btn-primary">Edit</Link>
          <form action={deleteProductAction}>
            <input type="hidden" name="id" value={product.id} />
            <button className="btn-danger">Delete</button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-5 space-y-3">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={product.name} className="w-full h-40 object-cover rounded-lg" />
          ) : (
            <div className="w-full h-40 bg-navy-50 rounded-lg flex items-center justify-center text-4xl">🛁</div>
          )}
          <div className="text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-500">Purchase price</span><b>{fmt(product.purchasePrice, settings.currency)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Selling price</span><b>{fmt(product.sellingPrice, settings.currency)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Margin / unit</span><b className="text-emerald-600">{fmt(margin, settings.currency)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">In stock</span>
              <span className={`badge ${low ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{product.stock} units</span>
            </div>
            <div className="flex justify-between"><span className="text-slate-500">Min alert</span><b>{product.minStock}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Stock value</span><b>{fmt(product.stock * product.purchasePrice, settings.currency)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Dimensions</span><b>{product.dimensions || "—"}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Supplier</span><b>{product.supplier?.name || "—"}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Created</span><b>{fmtDateTime(product.createdAt)}</b></div>
          </div>
          {product.description && <p className="text-sm text-slate-600 pt-2 border-t">{product.description}</p>}
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-navy-950 mb-3">Manual stock adjustment</h2>
            <form action={adjustStockAction} className="flex gap-3 flex-wrap items-end">
              <input type="hidden" name="id" value={product.id} />
              <div>
                <label className="label">Quantity (+/−)</label>
                <input name="qty" type="number" required className="input !w-32" placeholder="-2 or 10" />
              </div>
              <div className="flex-1 min-w-48">
                <label className="label">Reason</label>
                <input name="reason" required className="input" placeholder="Damaged, returned, counted..." />
              </div>
              <button className="btn-primary">Adjust</button>
            </form>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-navy-950 mb-3">Stock movement history</h2>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th><th className="th">Type</th><th className="th">Ref</th>
                  <th className="th">Reason</th><th className="th">Qty</th><th className="th">Balance</th>
                </tr>
              </thead>
              <tbody>
                {product.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="td text-slate-500">{fmtDateTime(m.date)}</td>
                    <td className="td"><span className="badge bg-navy-50 text-navy-900">{m.type}</span></td>
                    <td className="td text-slate-500">{m.ref || "—"}</td>
                    <td className="td text-slate-500">{m.reason}</td>
                    <td className={`td font-medium ${m.qty >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {m.qty >= 0 ? "+" : ""}{m.qty}
                    </td>
                    <td className="td font-medium">{m.balanceAfter}</td>
                  </tr>
                ))}
                {!product.movements.length && (
                  <tr><td colSpan={6} className="td text-center text-slate-400 py-6">No movements yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

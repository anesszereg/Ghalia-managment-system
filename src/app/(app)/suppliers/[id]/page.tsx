import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmt, fmtDate, getSettings, payStatus } from "@/lib/utils";
import { saveSupplierAction, deleteSupplierAction } from "@/lib/actions";

export default async function SupplierProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
  const settings = await getSettings();
  const supplier = await prisma.supplier.findUnique({
    where: { id: Number(id) },
    include: {
      products: true,
      purchases: { where: { status: "confirmed" }, orderBy: { date: "desc" }, include: { items: true } },
      payments: { where: { voided: false }, orderBy: { date: "desc" } },
    },
  });
  if (!supplier) notFound();

  const totalPurchases = supplier.purchases.reduce((s, x) => s + x.total, 0);
  const totalPaid = supplier.purchases.reduce((s, x) => s + x.paid, 0);
  const balance = totalPurchases - totalPaid;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-950">{supplier.name}</h1>
          <p className="text-sm text-slate-500">{supplier.phone} · {supplier.address}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/suppliers/${supplier.id}?edit=1`} className="btn-primary">Edit</Link>
          <form action={deleteSupplierAction}>
            <input type="hidden" name="id" value={supplier.id} />
            <button className="btn-danger">Delete</button>
          </form>
        </div>
      </div>

      {edit && (
        <form action={saveSupplierAction} className="card p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <input type="hidden" name="id" value={supplier.id} />
          <div><label className="label">Name *</label><input name="name" required defaultValue={supplier.name} className="input" /></div>
          <div className="md:col-span-3"><button className="btn-primary">Save changes</button></div>
        </form>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4"><div className="label">Total purchases</div><div className="text-xl font-bold">{fmt(totalPurchases, settings.currency)}</div></div>
        <div className="card p-4"><div className="label">Total paid</div><div className="text-xl font-bold text-emerald-600">{fmt(totalPaid, settings.currency)}</div></div>
        <div className="card p-4"><div className="label">Balance owed</div><div className={`text-xl font-bold ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(balance, settings.currency)}</div></div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-navy-950 mb-3">Products supplied ({supplier.products.length})</h2>
        <div className="flex gap-2 flex-wrap">
          {supplier.products.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`} className="badge bg-navy-50 text-navy-900 hover:bg-navy-100">{p.name}</Link>
          ))}
          {!supplier.products.length && <span className="text-sm text-slate-400">None linked</span>}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-navy-950 mb-3">Purchase history</h2>
        <table className="w-full">
          <thead><tr><th className="th">Reference</th><th className="th">Date</th><th className="th">Items</th><th className="th">Total</th><th className="th">Paid</th><th className="th">Status</th></tr></thead>
          <tbody>
            {supplier.purchases.map((p) => (
              <tr key={p.id}>
                <td className="td font-medium"><Link href={`/purchases/${p.id}`} className="text-navy-900 hover:underline">{p.ref}</Link></td>
                <td className="td text-slate-500">{fmtDate(p.date)}</td>
                <td className="td text-slate-500">{p.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</td>
                <td className="td">{fmt(p.total, settings.currency)}</td>
                <td className="td text-emerald-600">{fmt(p.paid, settings.currency)}</td>
                <td className="td"><span className={`badge ${p.paid < p.total ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{payStatus(p.paid, p.total)}</span></td>
              </tr>
            ))}
            {!supplier.purchases.length && <tr><td colSpan={6} className="td text-center text-slate-400 py-6">No purchases yet</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-navy-950 mb-3">Payments made</h2>
        <table className="w-full">
          <thead><tr><th className="th">Ref</th><th className="th">Date</th><th className="th">Method</th><th className="th">Amount</th><th className="th"></th></tr></thead>
          <tbody>
            {supplier.payments.map((p) => (
              <tr key={p.id}>
                <td className="td font-medium">{p.ref}</td>
                <td className="td text-slate-500">{fmtDate(p.date)}</td>
                <td className="td capitalize">{p.method}</td>
                <td className="td text-emerald-600">{fmt(p.amount, settings.currency)}</td>
                <td className="td text-right"><Link href={`/print/payment/${p.id}`} target="_blank" className="text-xs text-emerald-600">Receipt</Link></td>
              </tr>
            ))}
            {!supplier.payments.length && <tr><td colSpan={5} className="td text-center text-slate-400 py-6">No payments</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

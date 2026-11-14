import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmt, fmtDate, fmtDateTime, getSettings, payStatus } from "@/lib/utils";
import { cancelPurchaseAction } from "@/lib/actions";
import AddPaymentForm from "@/components/AddPaymentForm";

export default async function PurchaseDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const settings = await getSettings();
  const purchase = await prisma.purchase.findUnique({
    where: { id: Number(id) },
    include: {
      supplier: true,
      items: { include: { product: true } },
      payments: { where: { voided: false }, orderBy: { date: "asc" } },
    },
  });
  if (!purchase) notFound();
  const balance = purchase.total - purchase.paid;
  const cancelled = purchase.status === "cancelled";

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-950">{purchase.ref}</h1>
          <p className="text-sm text-slate-500">{fmtDateTime(purchase.date)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/print/purchase/${purchase.id}`} target="_blank" className="btn-ghost">🖨 Print</Link>
          {!cancelled && (
            <form action={cancelPurchaseAction}>
              <input type="hidden" name="id" value={purchase.id} />
              {purchase.paid > 0 && <label className="block text-xs mb-2"><input type="checkbox" name="cashConfirmed" value="yes" required /> Cash has been refunded by the supplier (or the original entry was incorrect).</label>}
              <button className="btn-danger">Cancel purchase</button>
            </form>
          )}
        </div>
      </div>

      {error === "stock" && (
        <div className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">
          Cannot cancel: some purchased stock has already been sold.
        </div>
      )}
      {cancelled && (
        <div className="card p-3 text-sm bg-slate-100 text-slate-600">This purchase has been cancelled. Stock and payments were reversed.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-2">
          <h2 className="font-semibold text-navy-950 mb-3">Items</h2>
          <table className="w-full">
            <thead><tr><th className="th">Product</th><th className="th">Qty</th><th className="th">Unit cost</th><th className="th">Total</th></tr></thead>
            <tbody>
              {purchase.items.map((it) => (
                <tr key={it.id}>
                  <td className="td">{it.name}{it.product && <span className="text-xs text-slate-400"> ({it.product.sku})</span>}</td>
                  <td className="td">{it.qty}</td>
                  <td className="td">{fmt(it.unitPrice, settings.currency)}</td>
                  <td className="td font-medium">{fmt(it.total, settings.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-5 space-y-2 text-sm h-fit">
          <h2 className="font-semibold text-navy-950 mb-2">Summary</h2>
          <div className="flex justify-between"><span className="text-slate-500">Supplier</span><b>{purchase.supplier?.name || purchase.supplierName || "—"}</b></div>
          <div className="flex justify-between text-base border-t pt-2"><span className="font-semibold">Total</span><b>{fmt(purchase.total, settings.currency)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><b className="text-emerald-600">{fmt(purchase.paid, settings.currency)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Balance</span><b className={balance > 0 ? "text-red-600" : "text-emerald-600"}>{fmt(balance, settings.currency)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Status</span>
            <span className={`badge ${balance > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              {cancelled ? "CANCELLED" : payStatus(purchase.paid, purchase.total)}
            </span>
          </div>
          <div className="flex justify-between"><span className="text-slate-500">Method</span><b className="capitalize">{purchase.paymentMethod}</b></div>
          {purchase.dueDate && <div className="flex justify-between"><span className="text-slate-500">Due date</span><b>{fmtDate(purchase.dueDate)}</b></div>}
          {purchase.notes && <p className="text-slate-600 border-t pt-2">{purchase.notes}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold text-navy-950 mb-3">Payment history</h2>
          <table className="w-full">
            <thead><tr><th className="th">Ref</th><th className="th">Date</th><th className="th">Method</th><th className="th">Amount</th><th className="th"></th></tr></thead>
            <tbody>
              {purchase.payments.map((p) => (
                <tr key={p.id}>
                  <td className="td font-medium">{p.ref}</td>
                  <td className="td text-slate-500">{fmtDate(p.date)}</td>
                  <td className="td capitalize">{p.method}</td>
                  <td className="td text-emerald-600 font-medium">{fmt(p.amount, settings.currency)}</td>
                  <td className="td text-right">
                    <Link href={`/print/payment/${p.id}`} target="_blank" className="text-xs text-emerald-600 font-medium">Receipt</Link>
                  </td>
                </tr>
              ))}
              {!purchase.payments.length && <tr><td colSpan={5} className="td text-center text-slate-400 py-4">No payments recorded</td></tr>}
            </tbody>
          </table>
        </div>
        {!cancelled && <AddPaymentForm type="PURCHASE" txnId={purchase.id} remaining={balance} currency={settings.currency} />}
      </div>
    </div>
  );
}

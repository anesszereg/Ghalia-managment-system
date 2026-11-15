import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmt, fmtDate, fmtDateTime, getSettings, payStatus } from "@/lib/utils";
import { cancelSaleAction, deleteSaleAction } from "@/lib/actions";
import AddPaymentForm from "@/components/AddPaymentForm";
import SubmitButton from "@/components/SubmitButton";
import { getSessionUser } from "@/lib/auth";
import { saleEmailConfigured } from "@/lib/sale-email";
import { retrySaleEmailAction } from "@/lib/sale-email-actions";

export const maxDuration = 60;

export default async function SaleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  await searchParams;
  const settings = await getSettings();
  const sale = await prisma.sale.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      emailNotification: true,
      items: { include: { product: true } },
      payments: { where: { voided: false }, orderBy: { date: "asc" } },
    },
  });
  if (!sale) notFound();
  const balance = sale.total - sale.paid;
  const cancelled = sale.status === "cancelled";
  const deleted = sale.status === "deleted";
  const user = await getSessionUser();
  const notification = sale.emailNotification;
  const emailReady = saleEmailConfigured();
  const canRetryEmail = notification?.status === "FAILED" && emailReady && user?.role === "admin";
  const emailLabels: Record<string, string> = { PENDING: emailReady ? "Email queued" : "Email awaiting setup", SENDING: "Email sending", SENT: "Email sent", FAILED: "Email retry queued", REVIEW: "Email requires attention in Resend", SKIPPED: "Email skipped: sale cancelled" };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-950">{sale.ref}</h1>
          <p className="text-sm text-slate-500">{fmtDateTime(sale.date)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/print/sale/${sale.id}`} target="_blank" className="btn-ghost">🖨 Print invoice</Link>
          <Link href={`/print/sale/${sale.id}?paper=80mm`} target="_blank" className="btn-ghost">🧾 Thermal 80mm</Link>
          {!cancelled && !deleted && (
            <div className="flex gap-4">
              <form action={cancelSaleAction}>
                <input type="hidden" name="id" value={sale.id} />
                {sale.paid > 0 && <label className="block text-xs mb-2"><input type="checkbox" name="cashConfirmed" value="yes" required /> Cash has been returned to the customer (or the original entry was incorrect).</label>}
                <button className="btn-danger">Cancel sale</button>
              </form>
              {user?.role === "admin" && (
                <form action={deleteSaleAction}>
                  <input type="hidden" name="id" value={sale.id} />
                  {sale.paid > 0 && <label className="block text-xs mb-2"><input type="checkbox" name="cashConfirmed" value="yes" required /> Cash has been returned to the customer (or the original entry was incorrect).</label>}
                  <button className="btn-danger">Delete sale</button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {notification && <div role="status" className={`card flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm ${notification.status === "SENT" ? "text-emerald-700" : "text-amber-800"}`}>
        <span>{emailLabels[notification.status] || "Email queued"}</span>
        {canRetryEmail && <form action={retrySaleEmailAction}><input type="hidden" name="saleId" value={sale.id} /><SubmitButton pendingLabel="Retrying…">Retry email</SubmitButton></form>}
      </div>}

      {cancelled && (
        <div className="card p-3 text-sm bg-slate-100 text-slate-600">This sale has been cancelled. Stock and payments were reversed.</div>
      )}
      {deleted && (
        <div className="card p-3 text-sm bg-slate-100 text-slate-600">This sale has been deleted. Stock and payments were reversed, and it is hidden from lists.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-2">
          <h2 className="font-semibold text-navy-950 mb-3">Items</h2>
          <table className="w-full">
            <thead>
              <tr><th className="th">Product</th><th className="th">Qty</th><th className="th">Unit price</th><th className="th">Total</th></tr>
            </thead>
            <tbody>
              {sale.items.map((it) => (
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
          <div className="flex justify-between"><span className="text-slate-500">Customer</span><b>{sale.customer?.name || sale.customerName || "Walk-in"}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Phone</span><b>{sale.customer?.phone || sale.customerPhone || "—"}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Discount</span><b>{fmt(sale.discount, settings.currency)}</b></div>
          <div className="flex justify-between text-base border-t pt-2"><span className="font-semibold">Total</span><b>{fmt(sale.total, settings.currency)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><b className="text-emerald-600">{fmt(sale.paid, settings.currency)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Balance</span><b className={balance > 0 ? "text-red-600" : "text-emerald-600"}>{fmt(balance, settings.currency)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Status</span>
            <span className={`badge ${balance > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              {cancelled ? "CANCELLED" : deleted ? "DELETED" : payStatus(sale.paid, sale.total)}
            </span>
          </div>
          <div className="flex justify-between"><span className="text-slate-500">Method</span><b className="capitalize">{sale.paymentMethod}</b></div>
          {sale.dueDate && <div className="flex justify-between"><span className="text-slate-500">Due date</span><b>{fmtDate(sale.dueDate)}</b></div>}
          {sale.notes && <p className="text-slate-600 border-t pt-2">{sale.notes}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold text-navy-950 mb-3">Payment history</h2>
          <table className="w-full">
            <thead><tr><th className="th">Ref</th><th className="th">Date</th><th className="th">Method</th><th className="th">Amount</th><th className="th"></th></tr></thead>
            <tbody>
              {sale.payments.map((p) => (
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
              {!sale.payments.length && <tr><td colSpan={5} className="td text-center text-slate-400 py-4">No payments recorded</td></tr>}
            </tbody>
          </table>
        </div>
        {!cancelled && !deleted && <AddPaymentForm type="SALE" txnId={sale.id} remaining={balance} currency={settings.currency} />}
      </div>
    </div>
  );
}

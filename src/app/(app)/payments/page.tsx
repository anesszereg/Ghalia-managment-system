import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmt, fmtDate, getSettings } from "@/lib/utils";
import { voidPaymentAction } from "@/lib/actions";
import { cashBalance as getCashBalance } from "@/lib/caisse";
import SubmitButton from "@/components/SubmitButton";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const payments = await prisma.payment.findMany({
    where: {
      voided: false,
      ...(sp.type ? { type: sp.type } : {}),
    },
    include: { sale: true, purchase: true, customer: true, supplier: true },
    orderBy: { date: "desc" },
    take: 200,
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const movements = await prisma.cashMovement.findMany({ where: { date: { gte: today, lt: tomorrow } } });
  const inToday = movements.reduce((s, m) => s + Math.max(0, m.amountCents) / 100, 0);
  const outToday = movements.reduce((s, m) => s + Math.max(0, -m.amountCents) / 100, 0);
  const balance = await prisma.$transaction(getCashBalance);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-navy-950">Payment history</h1><p className="mt-1 text-sm text-slate-500">Customer receipts and supplier payments. Record new payments from a sale or purchase.</p></div><Link href="/caisse" className="btn-ghost">View caisse</Link></div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4"><div className="label">Received today</div><div className="text-xl font-bold text-emerald-600">{fmt(inToday, settings.currency)}</div></div>
        <div className="card p-4"><div className="label">Paid today</div><div className="text-xl font-bold text-red-600">{fmt(outToday, settings.currency)}</div></div>
        <div className="card p-4"><div className="label">Daily net</div><div className={`text-xl font-bold ${inToday - outToday >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(inToday - outToday, settings.currency)}</div></div>
        <div className="card p-4"><div className="label">Cash balance (all time)</div><div className="text-xl font-bold text-navy-950">{fmt(balance / 100, settings.currency)}</div></div>
      </div>

      <div className="card p-4 flex flex-wrap gap-2">
        {[{ v: "", l: "All" }, { v: "SALE", l: "Received" }, { v: "PURCHASE", l: "Paid to suppliers" }].map((t) => (
          <Link key={t.v} href={t.v ? `/payments?type=${t.v}` : "/payments"}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${(sp.type || "") === t.v ? "bg-navy-900 text-white" : "bg-white border border-slate-300"}`}>
            {t.l}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr><th className="th">Ref</th><th className="th">Date</th><th className="th">Direction</th>
              <th className="th">Transaction</th><th className="th">Party</th><th className="th">Method</th>
              <th className="th">Amount</th><th className="th"></th></tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="td font-medium">{p.ref}</td>
                <td className="td text-slate-500">{fmtDate(p.date)}</td>
                <td className="td">
                  <span className={`badge ${p.type === "SALE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {p.type === "SALE" ? "↓ Received" : "↑ Paid"}
                  </span>
                </td>
                <td className="td">
                  {p.saleId && <Link href={`/sales/${p.saleId}`} className="text-navy-900 hover:underline">{p.sale?.ref}</Link>}
                  {p.purchaseId && <Link href={`/purchases/${p.purchaseId}`} className="text-navy-900 hover:underline">{p.purchase?.ref}</Link>}
                </td>
                <td className="td text-slate-500">{p.customer?.name || p.supplier?.name || "—"}</td>
                <td className="td capitalize">{p.method}</td>
                <td className={`td font-medium ${p.type === "SALE" ? "text-emerald-600" : "text-red-600"}`}>
                  {p.type === "SALE" ? "+" : "−"}{fmt(p.amount, settings.currency)}
                </td>
                <td className="td text-right whitespace-nowrap">
                  <Link href={`/print/payment/${p.id}`} target="_blank" className="text-xs text-emerald-600 font-medium mr-3">Receipt</Link>
                  <details className="mt-2 text-left"><summary className="text-xs text-slate-500">Correct payment</summary><form action={voidPaymentAction} className="mt-3 w-60 space-y-3 whitespace-normal rounded-lg bg-red-50 p-3">
                    <input type="hidden" name="id" value={p.id} />
                    <p className="text-xs text-red-800">Voiding reverses this payment in the caisse and restores the unpaid balance.</p>
                    <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="cashConfirmed" value="yes" required /> I confirm cash was returned or the entry was incorrect.</label>
                    <SubmitButton className="btn-danger !text-xs">Void & reverse cash</SubmitButton>
                  </form></details>
                </td>
              </tr>
            ))}
            {!payments.length && <tr><td colSpan={8} className="td text-center text-slate-400 py-8">No payments recorded</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

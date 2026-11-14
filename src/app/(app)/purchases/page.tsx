import Link from "next/link";
import { prisma, textContains } from "@/lib/db";
import { fmt, fmtDate, getSettings, payStatus } from "@/lib/utils";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const q = sp.q || "";
  const overdue = sp.filter === "overdue";
  const unpaidOnly = sp.filter === "unpaid";

  let purchases: any[];
  if (overdue || unpaidOnly) {
    const now = new Date();
    purchases = overdue
      ? await prisma.$queryRaw`SELECT * FROM "Purchase" WHERE status='confirmed' AND paid < total AND "dueDate" < ${now} ORDER BY date DESC`
      : await prisma.$queryRaw`SELECT * FROM "Purchase" WHERE status='confirmed' AND paid < total ORDER BY date DESC`;
  } else {
    purchases = await prisma.purchase.findMany({
      where: q ? { OR: [{ ref: textContains(q) }, { supplierName: textContains(q) }, { supplier: { name: textContains(q) } }] } : {},
      include: { supplier: true },
      orderBy: { date: "desc" },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy-950">Purchases</h1>
        <Link href="/purchases/new" className="btn-primary">+ New purchase</Link>
      </div>

      <form className="card p-4 flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-48">
          <label className="label">Search</label>
          <input name="q" defaultValue={q} placeholder="Reference or supplier..." className="input" />
        </div>
        <div>
          <label className="label">Balance</label>
          <select name="filter" defaultValue={sp.filter || ""} className="input !w-auto">
            <option value="">All</option>
            <option value="unpaid">With balance</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        <button className="btn-ghost">Apply filters</button>
        {(q || sp.filter) && <Link href="/purchases" className="py-3 text-sm text-slate-500 underline">Clear filters</Link>}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr>
              <th className="th">Reference</th><th className="th">Date</th><th className="th">Supplier</th>
              <th className="th">Total</th><th className="th">Paid</th><th className="th">Balance</th>
              <th className="th">Status</th><th className="th">Payment</th><th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p: any) => {
              const balance = p.total - p.paid;
              const od = p.status === "confirmed" && balance > 0 && p.dueDate && new Date(p.dueDate) < new Date();
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="td font-medium">
                    <Link href={`/purchases/${p.id}`} className="text-navy-900 hover:underline">{p.ref}</Link>
                  </td>
                  <td className="td text-slate-500">{fmtDate(p.date)}</td>
                  <td className="td">{p.supplier?.name || p.supplierName || "—"}</td>
                  <td className="td font-medium">{fmt(p.total, settings.currency)}</td>
                  <td className="td text-emerald-600">{fmt(p.paid, settings.currency)}</td>
                  <td className={`td ${balance > 0 ? "text-red-600 font-medium" : "text-slate-400"}`}>{fmt(balance, settings.currency)}</td>
                  <td className="td">
                    <span className={`badge ${p.status === "cancelled" ? "bg-slate-200 text-slate-600" : "bg-navy-50 text-navy-900"}`}>{p.status}</span>
                  </td>
                  <td className="td">
                    {p.status === "cancelled" ? "—" : (
                      <span className={`badge ${od ? "bg-red-100 text-red-700" : balance > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {od ? "OVERDUE" : payStatus(p.paid, p.total)}
                      </span>
                    )}
                  </td>
                  <td className="td text-right"><Link href={`/purchases/${p.id}`} className="text-sm text-emerald-600 font-medium">Open →</Link></td>
                </tr>
              );
            })}
            {!purchases.length && <tr><td colSpan={9} className="td text-center text-slate-400 py-8">No purchases found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { isPostgres, prisma } from "@/lib/db";
import { fmt, fmtDate, getSettings, rangeFromParams, payStatus } from "@/lib/utils";
import { SalesChart, ProfitChart } from "@/components/Charts";
import { cashBalance } from "@/lib/caisse";

function StatCard({
  label,
  value,
  sub,
  accent,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tone: string;
}) {
  return (
    <div className={`card stat-card ${tone} p-5`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${accent ? "text-emerald-600" : "text-navy-950"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { start, end, label } = rangeFromParams(sp.range, sp.from, sp.to);
  const settings = await getSettings();
  const cur = settings.currency;
  const balance = await prisma.$transaction(cashBalance);
  const collected = await prisma.cashMovement.aggregate({ where: { date: { gte: start, lte: end }, payment: { type: "SALE" } }, _sum: { amountCents: true } });

  const salesAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(total),0) as sales, COALESCE(SUM(paid),0) as collected, COUNT(*) as n
    FROM "Sale" WHERE status='confirmed' AND date BETWEEN ${start} AND ${end}`;
  const purchAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(total),0) as purchases, COALESCE(SUM(paid),0) as paidOut, COUNT(*) as n
    FROM "Purchase" WHERE status='confirmed' AND date BETWEEN ${start} AND ${end}`;
  const expAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(amount),0) as expenses FROM "Expense" WHERE date BETWEEN ${start} AND ${end}`;
  const cogsAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(si.qty * si."costPrice"),0) as cogs
    FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId"
    WHERE s.status='confirmed' AND s.date BETWEEN ${start} AND ${end}`;
  const stockAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(stock * "purchasePrice"),0) as value, COALESCE(SUM(stock),0) as units, COUNT(*) as products FROM "Product"`;
  const lowStock: any = await prisma.$queryRaw`
    SELECT COUNT(*) as c FROM "Product" WHERE stock <= "minStock"`;
  const custDebt: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(total - paid),0) as debt FROM "Sale" WHERE status='confirmed' AND paid < total`;
  const suppDebt: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(total - paid),0) as debt FROM "Purchase" WHERE status='confirmed' AND paid < total`;

  const sales = Number(salesAgg[0].sales);
  const purchases = Number(purchAgg[0].purchases);
  const expenses = Number(expAgg[0].expenses);
  const cogs = Number(cogsAgg[0].cogs);
  const grossProfit = sales - cogs;
  const netProfit = grossProfit - expenses;

  // chart data: last 12 months
  const month = Prisma.raw(isPostgres ? "to_char(s.date, 'YYYY-MM')" : "strftime('%Y-%m', s.date)");
  const chartRows: any = await prisma.$queryRaw`
    SELECT ${month} as m, COALESCE(SUM(s.total),0) as sales, COALESCE(SUM(costs.cogs),0) as cogs
    FROM "Sale" s LEFT JOIN (
      SELECT "saleId", SUM(qty * "costPrice") as cogs FROM "SaleItem" GROUP BY "saleId"
    ) costs ON costs."saleId"=s.id
    WHERE s.status='confirmed' GROUP BY ${month} ORDER BY m DESC LIMIT 12`;
  const chart = (chartRows as any[])
    .reverse()
    .map((r) => ({ label: r.m, sales: Number(r.sales), profit: Number(r.sales) - Number(r.cogs) }));

  const bestSellers: any = await prisma.$queryRaw`
    SELECT si.name, SUM(si.qty) as qty, SUM(si.total) as revenue
    FROM "SaleItem" si JOIN "Sale" s ON s.id=si."saleId"
    WHERE s.status='confirmed' AND s.date BETWEEN ${start} AND ${end}
    GROUP BY si.name ORDER BY qty DESC LIMIT 5`;

  const recentSales = await prisma.sale.findMany({
    orderBy: { date: "desc" },
    take: 5,
    include: { customer: true },
  });
  const recentPurchases = await prisma.purchase.findMany({
    orderBy: { date: "desc" },
    take: 5,
    include: { supplier: true },
  });
  const lowStockProducts = await prisma.$queryRaw`
    SELECT id, name, sku, stock, "minStock" FROM "Product" WHERE stock <= "minStock" ORDER BY stock LIMIT 6` as any[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-950">Overview</h1>
          <p className="mt-1 text-sm text-slate-500">Your showroom at a glance · {label}</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link href="/caisse" className="btn-ghost">View caisse</Link><Link href="/sales/new" className="btn-primary">New sale</Link></div>
      </div>
      <div className="card p-4">
        <form className="flex items-center gap-2 flex-wrap" aria-label="Dashboard period">
          {["today", "week", "month", "year"].map((r) => (
            <button
              key={r}
              name="range"
              value={r}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize cursor-pointer ${
                (sp.range || "today") === r
                  ? "bg-navy-900 text-white"
                  : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {r === "week" ? "This week" : r === "month" ? "This month" : r === "year" ? "This year" : "Today"}
            </button>
          ))}
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard tone="stat-blue" label="Sales" value={fmt(sales, cur)} sub={`${Number(salesAgg[0].n)} sales · selected period`} />
        <StatCard tone="stat-green" label="Cash received" value={fmt((collected._sum.amountCents || 0) / 100, cur)} sub="Customer payments, after reversals" />
        <StatCard tone="stat-violet" label="Caisse balance" value={fmt(balance / 100, cur)} sub="All time · provisional starting balance" />
        <StatCard tone="stat-amber" label="Net profit" value={fmt(netProfit, cur)} accent={netProfit >= 0} sub="Selected period · after expenses" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/sales?filter=unpaid" className="card p-4 hover:border-slate-400"><div className="text-sm text-slate-500">Unpaid sales</div><div className="mt-1 font-semibold">{fmt(Number(custDebt[0].debt), cur)}</div></Link>
        <Link href="/purchases?filter=unpaid" className="card p-4 hover:border-slate-400"><div className="text-sm text-slate-500">You owe suppliers</div><div className="mt-1 font-semibold">{fmt(Number(suppDebt[0].debt), cur)}</div></Link>
        <Link href="/products?filter=low" className="card p-4 hover:border-slate-400"><div className="text-sm text-slate-500">Stock needs attention</div><div className="mt-1 font-semibold">{Number(lowStock[0].c)} products low on stock</div></Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="card p-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-navy-950">Recent sales</h2>
            <Link href="/sales" className="text-xs text-emerald-600 font-medium">View all →</Link>
          </div>
          <table className="w-full">
            <tbody>
              {recentSales.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-sm">
                    <Link href={`/sales/${s.id}`} className="font-medium text-navy-900 hover:underline">{s.ref}</Link>
                    <div className="text-xs text-slate-400">{s.customer?.name || s.customerName || "Walk-in"}</div>
                  </td>
                  <td className="py-2 text-sm text-right">
                    {fmt(s.total, cur)}
                    <div className="text-xs text-slate-400">{payStatus(s.paid, s.total)}</div>
                  </td>
                </tr>
              ))}
              {!recentSales.length && <tr><td className="py-4 text-sm text-slate-400">No sales yet</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-navy-950">Recent purchases</h2>
            <Link href="/purchases" className="text-xs text-emerald-600 font-medium">View all →</Link>
          </div>
          <table className="w-full">
            <tbody>
              {recentPurchases.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-sm">
                    <Link href={`/purchases/${p.id}`} className="font-medium text-navy-900 hover:underline">{p.ref}</Link>
                    <div className="text-xs text-slate-400">{p.supplier?.name || p.supplierName}</div>
                  </td>
                  <td className="py-2 text-sm text-right">{fmt(p.total, cur)}</td>
                </tr>
              ))}
              {!recentPurchases.length && <tr><td className="py-4 text-sm text-slate-400">No purchases yet</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-navy-950 mb-3">Best sellers</h2>
          <table className="w-full">
            <tbody>
              {(bestSellers as any[]).map((b: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-sm">{b.name}</td>
                  <td className="py-2 text-sm text-right">
                    <span className="badge bg-emerald-100 text-emerald-700">{Number(b.qty)} sold</span>
                  </td>
                </tr>
              ))}
              {!(bestSellers as any[]).length && <tr><td className="py-4 text-sm text-slate-400">No sales in period</td></tr>}
            </tbody>
          </table>
          {lowStockProducts.length > 0 && (
            <>
              <h2 className="font-semibold text-navy-950 mt-5 mb-2">⚠️ Low stock</h2>
              {(lowStockProducts as any[]).map((p: any) => (
                <div key={p.id} className="flex justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                  <Link href={`/products/${p.id}`} className="hover:underline">{p.name}</Link>
                  <span className="badge bg-red-100 text-red-700">{p.stock} left</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Link href="/purchases/new" className="btn-ghost">New purchase</Link>
        <Link href="/products/new" className="btn-ghost">Add product</Link>
      </div>
    </div>
  );
}

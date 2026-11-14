import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmt, fmtDate, getSettings, rangeFromParams } from "@/lib/utils";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { start, end, label } = rangeFromParams(sp.range || "month", sp.from, sp.to);
  const settings = await getSettings();
  const cur = settings.currency;
  const cashIn = await prisma.cashMovement.aggregate({ where: { date: { gte: start, lte: end }, amountCents: { gt: 0 } }, _sum: { amountCents: true } });
  const cashOut = await prisma.cashMovement.aggregate({ where: { date: { gte: start, lte: end }, amountCents: { lt: 0 } }, _sum: { amountCents: true } });
  const qs = `from=${start.toISOString().slice(0, 10)}&to=${end.toISOString().slice(0, 10)}`;

  const salesAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(paid),0) paid, COUNT(*) n
    FROM "Sale" WHERE status='confirmed' AND date BETWEEN ${start} AND ${end}`;
  const purchAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(paid),0) paid, COUNT(*) n
    FROM "Purchase" WHERE status='confirmed' AND date BETWEEN ${start} AND ${end}`;
  const expAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(amount),0) total FROM "Expense" WHERE date BETWEEN ${start} AND ${end}`;
  const cogsAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(si.qty*si."costPrice"),0) cogs FROM "SaleItem" si JOIN "Sale" s ON s.id=si."saleId"
    WHERE s.status='confirmed' AND s.date BETWEEN ${start} AND ${end}`;
  const expByCat: any = await prisma.$queryRaw`
    SELECT category, SUM(amount) total FROM "Expense" WHERE date BETWEEN ${start} AND ${end} GROUP BY category ORDER BY total DESC`;
  const prodPerf: any = await prisma.$queryRaw`
    SELECT si.name, SUM(si.qty) qty, SUM(si.total) revenue, SUM(si.qty*si."costPrice") cost
    FROM "SaleItem" si JOIN "Sale" s ON s.id=si."saleId"
    WHERE s.status='confirmed' AND s.date BETWEEN ${start} AND ${end}
    GROUP BY si.name ORDER BY revenue DESC LIMIT 15`;
  const custDebts: any = await prisma.$queryRaw`
    SELECT c.name, s.ref, s.total, s.paid, (s.total-s.paid) balance, s."dueDate"
    FROM "Sale" s LEFT JOIN "Customer" c ON c.id=s."customerId"
    WHERE s.status='confirmed' AND s.paid < s.total ORDER BY balance DESC`;
  const suppDebts: any = await prisma.$queryRaw`
    SELECT p.ref, COALESCE(s.name, p."supplierName") name, p.total, p.paid, (p.total-p.paid) balance, p."dueDate"
    FROM "Purchase" p LEFT JOIN "Supplier" s ON s.id=p."supplierId"
    WHERE p.status='confirmed' AND p.paid < p.total ORDER BY balance DESC`;
  const inventory: any = await prisma.$queryRaw`
    SELECT name, sku, category, stock, "minStock", "purchasePrice", "sellingPrice", stock*"purchasePrice" value
    FROM "Product" ORDER BY value DESC`;

  const sales = Number(salesAgg[0].total);
  const cogs = Number(cogsAgg[0].cogs);
  const expenses = Number(expAgg[0].total);
  const gross = sales - cogs;
  const net = gross - expenses;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-950">Reports & Statistics</h1>
          <p className="text-sm text-slate-500">{label} · {fmtDate(start)} — {fmtDate(end)}</p>
        </div>
        <form className="flex gap-2 flex-wrap items-center">
          <select name="range" defaultValue={sp.range || "month"} className="input !w-auto">
            <option value="today">Today</option><option value="week">This week</option>
            <option value="month">This month</option><option value="year">This year</option>
          </select>
          <button className="btn-primary">Apply</button>
        </form>
      </div>

      <div className="card p-4 flex gap-4 flex-wrap items-start text-sm">
        <Link href={`/print/report?${qs}`} target="_blank" className="btn-primary">Print / save PDF</Link>
      </div>

      <div className="card p-4 text-sm flex flex-wrap gap-6">
        <Link href="/caisse" className="font-semibold underline">Caisse cash flow</Link>
        <span>Money in: <b>{fmt((cashIn._sum.amountCents || 0) / 100, cur)}</b></span>
        <span>Money out: <b>{fmt(Math.abs(cashOut._sum.amountCents || 0) / 100, cur)}</b></span>
        <span>Net: <b>{fmt(((cashIn._sum.amountCents || 0) + (cashOut._sum.amountCents || 0)) / 100, cur)}</b></span>
        <span className="text-slate-500">Includes owner movements and cash adjustments; not profit.</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4"><div className="label">Total sales</div><div className="text-xl font-bold">{fmt(sales, cur)}</div><div className="text-xs text-slate-400">{Number(salesAgg[0].n)} sales</div></div>
        <div className="card p-4"><div className="label">Total purchases</div><div className="text-xl font-bold">{fmt(Number(purchAgg[0].total), cur)}</div><div className="text-xs text-slate-400">{Number(purchAgg[0].n)} orders</div></div>
        <div className="card p-4"><div className="label">Gross profit</div><div className="text-xl font-bold text-emerald-600">{fmt(gross, cur)}</div><div className="text-xs text-slate-400">sales − COGS</div></div>
        <div className="card p-4"><div className="label">Net profit</div><div className={`text-xl font-bold ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(net, cur)}</div><div className="text-xs text-slate-400">after {fmt(expenses, cur)} expenses</div></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold text-navy-950 mb-3">Product performance</h2>
          <table className="w-full">
            <thead><tr><th className="th">Product</th><th className="th">Qty</th><th className="th">Revenue</th><th className="th">Profit</th></tr></thead>
            <tbody>
              {prodPerf.map((p: any, i: number) => (
                <tr key={i}><td className="td">{p.name}</td><td className="td">{Number(p.qty)}</td>
                  <td className="td">{fmt(Number(p.revenue), cur)}</td>
                  <td className="td text-emerald-600">{fmt(Number(p.revenue) - Number(p.cost), cur)}</td></tr>
              ))}
              {!prodPerf.length && <tr><td colSpan={4} className="td text-center text-slate-400 py-6">No sales in period</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-navy-950 mb-3">Expenses by category</h2>
          <table className="w-full">
            <thead><tr><th className="th">Category</th><th className="th">Amount</th></tr></thead>
            <tbody>
              {expByCat.map((e: any, i: number) => (
                <tr key={i}><td className="td">{e.category}</td><td className="td text-red-600">{fmt(Number(e.total), cur)}</td></tr>
              ))}
              {!expByCat.length && <tr><td colSpan={2} className="td text-center text-slate-400 py-6">No expenses</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-navy-950 mb-3">Customer debts</h2>
          <table className="w-full">
            <thead><tr><th className="th">Customer</th><th className="th">Sale</th><th className="th">Balance</th><th className="th">Due</th></tr></thead>
            <tbody>
              {custDebts.map((d: any, i: number) => (
                <tr key={i}><td className="td">{d.name || "Walk-in"}</td><td className="td">{d.ref}</td>
                  <td className="td text-red-600 font-medium">{fmt(Number(d.balance), cur)}</td>
                  <td className="td text-slate-500">{fmtDate(d.dueDate)}</td></tr>
              ))}
              {!custDebts.length && <tr><td colSpan={4} className="td text-center text-slate-400 py-6">No outstanding debts</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-navy-950 mb-3">Supplier debts</h2>
          <table className="w-full">
            <thead><tr><th className="th">Supplier</th><th className="th">Purchase</th><th className="th">Balance</th><th className="th">Due</th></tr></thead>
            <tbody>
              {suppDebts.map((d: any, i: number) => (
                <tr key={i}><td className="td">{d.name || "—"}</td><td className="td">{d.ref}</td>
                  <td className="td text-red-600 font-medium">{fmt(Number(d.balance), cur)}</td>
                  <td className="td text-slate-500">{fmtDate(d.dueDate)}</td></tr>
              ))}
              {!suppDebts.length && <tr><td colSpan={4} className="td text-center text-slate-400 py-6">No outstanding debts</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-navy-950 mb-3">Inventory report</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead><tr><th className="th">Product</th><th className="th">SKU</th><th className="th">Category</th><th className="th">Stock</th><th className="th">Cost</th><th className="th">Price</th><th className="th">Value</th></tr></thead>
            <tbody>
              {inventory.map((p: any, i: number) => (
                <tr key={i}>
                  <td className="td">{p.name}</td><td className="td text-slate-500">{p.sku}</td>
                  <td className="td">{p.category}</td>
                  <td className="td"><span className={`badge ${p.stock <= p.minStock ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{p.stock}</span></td>
                  <td className="td">{fmt(p.purchasePrice, cur)}</td>
                  <td className="td">{fmt(p.sellingPrice, cur)}</td>
                  <td className="td font-medium">{fmt(Number(p.value), cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

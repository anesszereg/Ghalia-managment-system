import { prisma } from "@/lib/db";
import { fmt, fmtDate, getSettings } from "@/lib/utils";
import { PrintToolbar } from "@/components/PrintDoc";

export default async function PrintReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const s = await getSettings();
  const start = sp.from ? new Date(sp.from + "T00:00:00") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = sp.to ? new Date(sp.to + "T23:59:59.999") : new Date();

  const salesAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(paid),0) paid, COUNT(*) n
    FROM "Sale" WHERE status='confirmed' AND date BETWEEN ${start} AND ${end}`;
  const purchAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(paid),0) paid, COUNT(*) n
    FROM "Purchase" WHERE status='confirmed' AND date BETWEEN ${start} AND ${end}`;
  const expAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(amount),0) total FROM "Expense" WHERE date BETWEEN ${start} AND ${end}`;
  const cogsAgg: any = await prisma.$queryRaw`
    SELECT COALESCE(SUM(si.qty*si."costPrice"),0) cogs FROM "SaleItem" si JOIN "Sale" s2 ON s2.id=si."saleId"
    WHERE s2.status='confirmed' AND s2.date BETWEEN ${start} AND ${end}`;
  const custDebt: any = await prisma.$queryRaw`SELECT COALESCE(SUM(total-paid),0) d FROM "Sale" WHERE status='confirmed' AND paid < total`;
  const suppDebt: any = await prisma.$queryRaw`SELECT COALESCE(SUM(total-paid),0) d FROM "Purchase" WHERE status='confirmed' AND paid < total`;

  const sales = Number(salesAgg[0].total);
  const gross = sales - Number(cogsAgg[0].cogs);
  const expenses = Number(expAgg[0].total);
  const net = gross - expenses;

  const Row = ({ label, value, bold }: any) => (
    <tr className="border-b border-slate-100">
      <td className="py-2 text-sm">{label}</td>
      <td className={`py-2 text-sm text-right ${bold ? "font-bold" : ""}`}>{value}</td>
    </tr>
  );

  return (
    <div>
      <PrintToolbar />
      <div id="print-area" className="mx-auto bg-white p-10 max-w-[210mm] text-navy-950">
        <div className="text-2xl font-bold">{s.showroomName}</div>
        <div className="text-sm text-slate-500">{s.address} · {s.phone}</div>
        <div className="text-xl font-bold mt-6">FINANCIAL REPORT</div>
        <div className="text-sm text-slate-500">{fmtDate(start)} — {fmtDate(end)}</div>

        <table className="w-full mt-6">
          <tbody>
            <Row label={`Sales (${Number(salesAgg[0].n)} transactions)`} value={fmt(sales, s.currency)} />
            <Row label="Amount collected from customers" value={fmt(Number(salesAgg[0].paid), s.currency)} />
            <Row label={`Purchases (${Number(purchAgg[0].n)} orders)`} value={fmt(Number(purchAgg[0].total), s.currency)} />
            <Row label="Amount paid to suppliers" value={fmt(Number(purchAgg[0].paid), s.currency)} />
            <Row label="Cost of goods sold" value={fmt(Number(cogsAgg[0].cogs), s.currency)} />
            <Row label="Gross profit (sales − COGS)" value={fmt(gross, s.currency)} bold />
            <Row label="Operating expenses" value={fmt(expenses, s.currency)} />
            <Row label="Net profit" value={fmt(net, s.currency)} bold />
            <Row label="Outstanding customer debts" value={fmt(Number(custDebt[0].d), s.currency)} />
            <Row label="Outstanding supplier debts" value={fmt(Number(suppDebt[0].d), s.currency)} />
          </tbody>
        </table>

        <div className="mt-12 text-center text-xs text-slate-400 border-t pt-4">
          Generated {fmtDate(new Date())} · {s.showroomName}
        </div>
      </div>
    </div>
  );
}

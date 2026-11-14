import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmt, fmtDate, getSettings, EXPENSE_CATEGORIES } from "@/lib/utils";
import { saveExpenseAction, deleteExpenseAction } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const month = sp.month || new Date().toISOString().slice(0, 7);
  const start = new Date(month + "-01T00:00:00");
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);

  const expenses = await prisma.expense.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: "desc" },
  });
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const editExpense = sp.edit ? await prisma.expense.findUnique({ where: { id: Number(sp.edit) } }) : null;
  const showForm = sp.new || editExpense;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy-950">Expenses</h1>
        <Link href="/expenses?new=1" className="btn-primary">+ New expense</Link>
      </div>

      {showForm && (
        <form action={saveExpenseAction} className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <div className="md:col-span-2"><h2 className="font-semibold">{editExpense ? "Edit expense" : "Record a cash expense"}</h2><p className="mt-1 text-sm text-slate-500">This expense is paid from your open caisse session.</p></div>
          {editExpense && <input type="hidden" name="id" value={editExpense.id} />}
          <div>
            <label className="label">Category</label>
            <select name="category" defaultValue={editExpense?.category} className="input">
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label">Amount *</label><input name="amount" type="number" step="0.01" min="0.01" required defaultValue={editExpense?.amount} className="input" /></div>
          <input type="hidden" name="method" value="cash" />
          <div className="md:col-span-2 flex flex-wrap gap-3"><SubmitButton>{editExpense ? "Save changes" : "Save expense"}</SubmitButton><Link href="/expenses" className="btn-ghost">Cancel</Link></div>
        </form>
      )}

      <form className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Month</label>
          <input name="month" type="month" defaultValue={month} className="input !w-auto" />
        </div>
        <button className="btn-primary">Apply</button>
        <div className="ml-auto text-sm text-slate-500 pb-2">Total: <b className="text-navy-950">{fmt(total, settings.currency)}</b></div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead><tr><th className="th">Ref</th><th className="th">Date</th><th className="th">Category</th><th className="th">Method</th><th className="th">Notes</th><th className="th">Amount</th><th className="th"></th></tr></thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="td font-medium">{e.ref}</td>
                <td className="td text-slate-500">{fmtDate(e.date)}</td>
                <td className="td"><span className="badge bg-navy-50 text-navy-900">{e.category}</span></td>
                <td className="td capitalize">{e.method}</td>
                <td className="td text-slate-500">{e.notes || "—"}</td>
                <td className="td font-medium text-red-600">{fmt(e.amount, settings.currency)}</td>
                <td className="td text-right whitespace-nowrap">
                  <Link href={`/expenses?edit=${e.id}&month=${month}`} className="text-xs text-emerald-600 font-medium mr-3">Edit</Link>
                  <details className="mt-2 text-left"><summary className="text-xs text-slate-500">Correct entry</summary><form action={deleteExpenseAction} className="mt-3 w-60 space-y-3 whitespace-normal rounded-lg bg-red-50 p-3">
                    <input type="hidden" name="id" value={e.id} />
                    <p className="text-xs text-red-800">Deleting reverses the cash movement. Use only for a refund or an incorrect entry.</p>
                    <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="cashConfirmed" value="yes" required /> I confirm cash was refunded or the entry was incorrect.</label>
                    <SubmitButton className="btn-danger !text-xs">Delete & reverse cash</SubmitButton>
                  </form></details>
                </td>
              </tr>
            ))}
            {!expenses.length && <tr><td colSpan={7} className="td text-center text-slate-400 py-8">No expenses this month</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

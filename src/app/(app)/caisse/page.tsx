import Link from "next/link";
import { prisma } from "@/lib/db";
import { cashBalance } from "@/lib/caisse";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { initializeCaisseAction, openCaisseAction, closeCaisseAction, manualCashAction } from "@/lib/caisse-actions";
import { fmt, fmtDate, getSettings, rangeFromParams } from "@/lib/utils";
import SubmitButton from "@/components/SubmitButton";

const MOVEMENT_LABELS: Record<string, string> = {
  CUSTOMER_PAYMENT: "Customer payment", SUPPLIER_PAYMENT: "Supplier payment", EXPENSE: "Expense",
  OWNER_DEPOSIT: "Owner deposit", OWNER_WITHDRAWAL: "Owner withdrawal", REVERSAL: "Correction / refund", CLOSING_DIFFERENCE: "Cash count adjustment",
};

export default async function CaissePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const settings = await getSettings();
  const money = (value: number) => fmt(value / 100, settings.currency);
  const book = await prisma.cashbook.findUnique({ where: { id: 1 } });
  if (!book) return <div className="mx-auto max-w-2xl space-y-6 py-6">
    <div><h1 className="text-2xl font-bold">Set up your caisse</h1><p className="mt-2 text-slate-500">One place for all cash received and paid.</p></div>
    <div className="card space-y-6 p-6 sm:p-8">
      <ol className="space-y-5">{[["1", "Bring in your history", "Import existing cash payments and expenses. Your provisional starting balance is 0."], ["2", "Open a daily session", "Open the caisse before recording a payment or expense."], ["3", "Count and close", "At the end of the day, count your cash and explain any difference."]].map(([step, title, text]) => <li key={step} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-sm font-semibold">{step}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-relaxed text-slate-500">{text}</p></div></li>)}</ol>
      {user.role === "admin" ? <form action={initializeCaisseAction}><SubmitButton pendingLabel="Importing history…">Set up caisse & import history</SubmitButton></form> : <p className="text-sm text-slate-500">Ask an administrator to set up the caisse.</p>}
    </div>
  </div>;
  const { start, end } = rangeFromParams(sp.range || "today", sp.from, sp.to);
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const where = { date: { gte: start, lte: end } };
  const [balance, session, movements, count, moneyIn, moneyOut, sessions] = await Promise.all([
    prisma.$transaction(cashBalance),
    prisma.cashSession.findUnique({ where: { openKey: 1 } }),
    prisma.cashMovement.findMany({ where, include: { payment: true }, orderBy: [{ date: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 50 }),
    prisma.cashMovement.count({ where }),
    prisma.cashMovement.aggregate({ where: { ...where, amountCents: { gt: 0 } }, _sum: { amountCents: true } }),
    prisma.cashMovement.aggregate({ where: { ...where, amountCents: { lt: 0 } }, _sum: { amountCents: true } }),
    prisma.cashSession.findMany({ orderBy: { id: "desc" }, take: 30 }),
  ]);
  const incoming = moneyIn._sum.amountCents || 0;
  const outgoing = Math.abs(moneyOut._sum.amountCents || 0);
  const stale = !!session && session.openedAt.toDateString() !== new Date().toDateString();
  const qs = new URLSearchParams({ range: sp.range || "today", ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) });
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Caisse</h1><p className="mt-1 text-sm text-slate-500">Your cash, from opening to closing.</p></div><span className={`badge ${session && !stale ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{stale ? "Previous session needs closing" : session ? "Session open" : "Session closed"}</span></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white shadow-sm"><div className="text-sm text-white/70">Cash in caisse · all time</div><div className="mt-2 text-3xl font-semibold tabular-nums">{money(balance)}</div></div>
      <div className="card stat-card stat-green p-5"><div className="text-sm text-slate-500">Money in · selected period</div><div className="mt-2 text-2xl font-semibold text-emerald-700">{money(incoming)}</div></div>
      <div className="card stat-card stat-amber p-5"><div className="text-sm text-slate-500">Money out · selected period</div><div className="mt-2 text-2xl font-semibold">{money(outgoing)}</div></div>
    </div>
    <section className="card p-5 sm:p-6" aria-labelledby="daily-session">
      <h2 id="daily-session" className="font-semibold">{stale ? "Close the previous session" : session ? "You are ready to record cash" : "Start your day"}</h2>
      {session ? <>
        <p className="mt-2 text-sm text-slate-500">Session #{session.id} · Opened {session.openedAt.toLocaleString()} · Opening cash {money(session.openingCents)}</p>
        {stale ? <p className="mt-3 text-sm text-amber-800">Close this session before recording new cash movements.</p> : <div className="mt-4 flex flex-wrap gap-2"><Link href="/sales/new" className="btn-primary">New sale</Link><Link href="/expenses?new=1" className="btn-ghost">Record expense</Link><Link href="/payments" className="btn-ghost">Find a payment</Link></div>}
        <details open={stale} className="mt-5 border-t border-slate-100 pt-4">
          <summary className="text-sm font-medium">End the day: count & close caisse</summary>
          <form action={closeCaisseAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="sessionId" value={session.id} />
            <label className="block"><span className="label">Cash you counted ({settings.currency})</span><input name="counted" type="number" min="0" step="0.01" required className="input" /><span className="mt-2 block text-xs text-slate-500">Expected cash: {money(balance)}</span></label>
            <label className="block"><span className="label">Closing note</span><input name="notes" placeholder="Explain any difference" className="input" /><span className="mt-2 block text-xs text-slate-500">Required if the counted cash differs.</span></label>
            <p className="text-sm text-slate-500 sm:col-span-2">Any difference is saved as a cash adjustment, not profit or expense. The next session starts with your counted balance.</p>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Closing session…">Confirm count & close</SubmitButton></div>
          </form>
        </details>
      </> : <><p className="mt-2 text-sm text-slate-500">Open a session before recording payments, expenses or refunds. Starting cash: {money(balance)}.</p><form action={openCaisseAction} className="mt-4"><SubmitButton pendingLabel="Opening session…">Open caisse session</SubmitButton></form></>}
    </section>
    {session && !stale && user.role === "admin" && <details className="card p-5">
      <summary className="text-sm font-medium">Owner deposit or withdrawal</summary>
      <p className="mt-3 text-sm text-slate-500">Use this only for owner funds. Record business costs as expenses.</p>
      <form action={manualCashAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Movement</span><select name="kind" className="input"><option value="OWNER_DEPOSIT">Add owner cash</option><option value="OWNER_WITHDRAWAL">Withdraw owner cash</option></select></label>
        <label><span className="label">Amount ({settings.currency})</span><input name="amount" type="number" min="0.01" step="0.01" required className="input" /></label>
        <label className="sm:col-span-2"><span className="label">Reason</span><input name="notes" required className="input" /></label><div><SubmitButton>Save cash movement</SubmitButton></div>
      </form>
    </details>}
    <section className="space-y-4" aria-labelledby="cash-history">
      <h2 id="cash-history" className="text-lg font-semibold">Cash history</h2>
      <form className="card flex flex-wrap items-end gap-3 p-4">
        <label><span className="label">Period</span><select name="range" defaultValue={sp.range || "today"} className="input"><option value="today">Today</option><option value="month">This month</option><option value="year">This year</option></select></label>
        <button className="btn-ghost">Apply filter</button>
        <a className="ml-auto py-3 text-sm font-medium text-slate-600 underline underline-offset-4" href={`/api/export?type=caisse&from=${start.toISOString().slice(0, 10)}&to=${end.toISOString().slice(0, 10)}`}>Export CSV</a>
      </form>
      <div className="card overflow-x-auto">{!movements.length ? <div className="px-5 py-12 text-center"><p className="font-medium">No cash movements in this period</p><p className="mt-2 text-sm text-slate-500">Try a different period, or record a payment or expense.</p></div> : <table className="w-full min-w-[680px]"><caption className="sr-only">Cash movements in the selected period</caption><thead><tr>{["Date", "Movement", "Session", "Money in", "Money out"].map(h => <th scope="col" key={h} className="th">{h}</th>)}</tr></thead><tbody>
        {movements.map(m => <tr key={m.id}><td className="td text-slate-500">{fmtDate(m.date)}</td><td className="td"><div className="font-medium">{MOVEMENT_LABELS[m.kind] || m.kind}</div><div className="mt-1 text-xs text-slate-500">{m.payment ? <Link className="underline" href={m.payment.saleId ? `/sales/${m.payment.saleId}` : `/purchases/${m.payment.purchaseId}`}>{m.reference}</Link> : m.expenseId ? <Link className="underline" href={`/expenses?edit=${m.expenseId}`}>{m.reference}</Link> : m.reference}{m.reversalOfId ? ` · Reverses movement #${m.reversalOfId}` : ""}</div>{m.notes && <p className="mt-1 max-w-sm text-xs text-slate-500">{m.notes}</p>}</td><td className="td text-slate-500">{m.historical ? "Historical" : `#${m.sessionId}`}</td><td className="td font-medium text-emerald-700">{m.amountCents > 0 ? money(m.amountCents) : "—"}</td><td className="td font-medium">{m.amountCents < 0 ? money(-m.amountCents) : "—"}</td></tr>)}
      </tbody></table>}</div>
      <div className="flex items-center justify-between gap-4 text-sm text-slate-500"><span>{count} movements · Page {page}</span><div className="flex gap-4">{page > 1 && <Link className="underline" href={`/caisse?${qs}&page=${page - 1}`}>Previous</Link>}{page * 50 < count && <Link className="underline" href={`/caisse?${qs}&page=${page + 1}`}>Next</Link>}</div></div>
    </section>
    <p className="text-xs leading-relaxed text-slate-500">Starting baseline: 0 {settings.currency} (provisional). Historical balances are unverified; reconcile them against your actual cash count.</p>
  </div>;
}

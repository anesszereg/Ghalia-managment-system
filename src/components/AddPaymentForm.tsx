import Link from "next/link";
import { addPaymentAction, paySupplierOpeningBalanceAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import SubmitButton from "./SubmitButton";

export default async function AddPaymentForm({ type, txnId, remaining, currency, supplierOpening = false }: { type: "SALE" | "PURCHASE"; txnId: number; remaining: number; currency: string; supplierOpening?: boolean }) {
  if (remaining <= 0) return null;
  const session = await prisma.cashSession.findUnique({ where: { openKey: 1 } });
  const cashReady = session?.openedAt.toDateString() === new Date().toDateString();
  return <form action={supplierOpening ? paySupplierOpeningBalanceAction : addPaymentAction} className="card space-y-5 p-5 sm:p-6">
    <div><h2 className="font-semibold">{supplierOpening ? "Pay supplier opening balance" : type === "SALE" ? "Receive customer payment" : "Pay supplier"}</h2><p className="mt-1 text-sm text-slate-500">Remaining: <b>{remaining.toLocaleString()} {currency}</b></p></div>
    <input type="hidden" name="type" value={type} /><input type="hidden" name="txnId" value={txnId} /><input type="hidden" name="method" value="cash" />
    {cashReady ? <>
      <label className="block"><span className="label">Cash amount ({currency})</span><input name="amount" type="number" step="0.01" min="0.01" max={remaining} required defaultValue={remaining} className="input" /></label>
      <p className="text-xs text-slate-500">This payment will be recorded in your open caisse session.</p>
      <SubmitButton pendingLabel="Recording payment…">{type === "SALE" ? "Record cash received" : "Record cash paid"}</SubmitButton>
    </> : <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900"><p>Open the caisse before recording this payment.</p><Link href="/caisse" className="mt-3 inline-block font-semibold underline">Go to caisse</Link></div>}
  </form>;
}

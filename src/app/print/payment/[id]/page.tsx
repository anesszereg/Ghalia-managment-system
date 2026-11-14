import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDateTime, getSettings, payStatus } from "@/lib/utils";
import { PrintToolbar } from "@/components/PrintDoc";

export default async function PrintPayment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSettings();
  const p = await prisma.payment.findUnique({
    where: { id: Number(id) },
    include: {
      sale: { include: { customer: true } },
      purchase: { include: { supplier: true } },
      customer: true,
      supplier: true,
      cashMovements: { orderBy: { id: "asc" } },
    },
  });
  if (!p) notFound();

  const received = p.type === "SALE";
  const txn = p.sale || p.purchase;
  const party = p.customer?.name || p.sale?.customer?.name || p.sale?.customerName || p.supplier?.name || "—";
  const txnTotal = txn?.total ?? 0;
  const txnPaid = txn?.paid ?? 0;

  return (
    <div>
      <PrintToolbar auto={false} />
      <div id="print-area" className="mx-auto bg-white p-10 max-w-[210mm] text-navy-950">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-2xl font-bold text-navy-950">{s.showroomName}</div>
            <div className="text-sm text-slate-500">{s.address}</div>
            <div className="text-sm text-slate-500">{s.phone}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-wide">PAYMENT RECEIPT</div>
            <div className="text-sm mt-1">{p.ref}</div>
            <div className="text-sm text-slate-500">{fmtDateTime(p.date)}</div>
          </div>
        </div>

        {p.voided && <div className="mt-6 text-red-700 font-bold">VOIDED — NOT A VALID PAYMENT RECEIPT</div>}
        {p.cashMovements.length > 0 && <div className="mt-4 text-sm">Caisse: {p.cashMovements.map(m => `Movement #${m.id} (${m.historical ? "historical" : `session #${m.sessionId}`}${m.reversalOfId ? ", reversal" : ""})`).join(" · ")}</div>}
        <div className="mt-10 border-2 border-navy-950 rounded-xl p-6 text-center">
          <div className="text-xs uppercase text-slate-400 font-semibold">
            {received ? "Amount received" : "Amount paid"}
          </div>
          <div className="text-4xl font-bold mt-1">{p.amount.toLocaleString()} {s.currency}</div>
          <div className="text-sm text-slate-500 capitalize mt-1">via {p.method}</div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase text-slate-400 mb-1">{received ? "Received from" : "Paid to"}</div>
            <div className="font-medium">{party}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase text-slate-400 mb-1">For transaction</div>
            <div className="font-medium">{txn?.ref || "—"}</div>
            <div className="text-slate-500">Status: {payStatus(txnPaid, txnTotal)}</div>
          </div>
        </div>

        <div className="mt-4 w-80 ml-auto text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Transaction total</span><span>{txnTotal.toLocaleString()} {s.currency}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Total paid to date</span><span>{txnPaid.toLocaleString()} {s.currency}</span></div>
          <div className="flex justify-between font-semibold"><span>Remaining balance</span><span>{(txnTotal - txnPaid).toLocaleString()} {s.currency}</span></div>
        </div>

        {p.notes && <div className="mt-6 text-sm text-slate-600"><b>Notes:</b> {p.notes}</div>}
        <div className="mt-16 flex justify-between text-sm">
          <div className="w-56 border-t border-slate-400 pt-2 text-center text-slate-500">{received ? "Payer" : "Recipient"} signature</div>
          <div className="w-56 border-t border-slate-400 pt-2 text-center text-slate-500">Authorized signature</div>
        </div>
        <div className="mt-10 text-center text-xs text-slate-400 border-t pt-4">{s.receiptFooter}</div>
      </div>
    </div>
  );
}

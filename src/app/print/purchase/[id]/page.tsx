import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDateTime, getSettings, payStatus } from "@/lib/utils";
import { PrintToolbar, StatusStamp } from "@/components/PrintDoc";

export default async function PrintPurchase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSettings();
  const purchase = await prisma.purchase.findUnique({
    where: { id: Number(id) },
    include: { supplier: true, items: true },
  });
  if (!purchase) notFound();
  const status = payStatus(purchase.paid, purchase.total);
  const cancelled = purchase.status === "cancelled";

  return (
    <div>
      <PrintToolbar />
      <div id="print-area" className="mx-auto bg-white p-10 max-w-[210mm] text-navy-950">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-2xl font-bold text-navy-950">{s.showroomName}</div>
            <div className="text-sm text-slate-500">{s.address}</div>
            <div className="text-sm text-slate-500">{s.phone}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-wide">PURCHASE ORDER</div>
            <div className="text-sm mt-1">{purchase.ref}</div>
            <div className="text-sm text-slate-500">{fmtDateTime(purchase.date)}</div>
            <div className="mt-3"><StatusStamp status={status} cancelled={cancelled} /></div>
          </div>
        </div>

        <div className="mt-8 border border-slate-200 rounded-lg p-4 w-80">
          <div className="text-xs font-semibold uppercase text-slate-400 mb-1">Supplier</div>
          <div className="font-medium">{purchase.supplier?.name || purchase.supplierName || "—"}</div>
          <div className="text-sm text-slate-500">{purchase.supplier?.phone}</div>
          <div className="text-sm text-slate-500">{purchase.supplier?.address}</div>
        </div>

        <table className="w-full mt-6">
          <thead>
            <tr className="border-b-2 border-navy-950">
              <th className="text-left py-2 text-xs uppercase text-slate-500">#</th>
              <th className="text-left py-2 text-xs uppercase text-slate-500">Item</th>
              <th className="text-right py-2 text-xs uppercase text-slate-500">Qty</th>
              <th className="text-right py-2 text-xs uppercase text-slate-500">Unit cost</th>
              <th className="text-right py-2 text-xs uppercase text-slate-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((it, i) => (
              <tr key={it.id} className="border-b border-slate-100">
                <td className="py-2.5 text-sm text-slate-400">{i + 1}</td>
                <td className="py-2.5 text-sm font-medium">{it.name}</td>
                <td className="py-2.5 text-sm text-right">{it.qty}</td>
                <td className="py-2.5 text-sm text-right">{it.unitPrice.toLocaleString()}</td>
                <td className="py-2.5 text-sm text-right font-medium">{it.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between text-lg font-bold border-t-2 border-navy-950 pt-2"><span>Total</span><span>{purchase.total.toLocaleString()} {s.currency}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Amount paid</span><span className="text-emerald-600 font-medium">{purchase.paid.toLocaleString()} {s.currency}</span></div>
            <div className="flex justify-between font-semibold"><span>Balance due</span><span className={purchase.total - purchase.paid > 0 ? "text-red-600" : ""}>{(purchase.total - purchase.paid).toLocaleString()} {s.currency}</span></div>
          </div>
        </div>

        {purchase.notes && <div className="mt-6 text-sm text-slate-600"><b>Notes:</b> {purchase.notes}</div>}
        <div className="mt-16 flex justify-between text-sm">
          <div className="w-56 border-t border-slate-400 pt-2 text-center text-slate-500">Supplier signature</div>
          <div className="w-56 border-t border-slate-400 pt-2 text-center text-slate-500">Authorized signature</div>
        </div>
      </div>
    </div>
  );
}

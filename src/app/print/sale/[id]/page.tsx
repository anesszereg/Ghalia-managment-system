import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmt, fmtDateTime, getSettings, payStatus } from "@/lib/utils";
import { PrintToolbar, StatusStamp } from "@/components/PrintDoc";

export default async function PrintSale({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paper?: string }>;
}) {
  const { id } = await params;
  const { paper } = await searchParams;
  const s = await getSettings();
  const sale = await prisma.sale.findUnique({
    where: { id: Number(id) },
    include: { customer: true, items: true, payments: { where: { voided: false } } },
  });
  if (!sale) notFound();

  const status = payStatus(sale.paid, sale.total);
  const cancelled = sale.status === "cancelled";
  const thermal = paper === "80mm";

  if (thermal) {
    return (
      <div>
        <PrintToolbar />
        <div id="print-area" className="mx-auto p-2 text-[11px] leading-tight font-mono" style={{ width: "72mm" }}>
          <div className="text-center">
            <div className="font-bold text-sm">{s.showroomName}</div>
            <div>{s.address}</div>
            <div>{s.phone}</div>
            <div className="border-t border-dashed border-black my-2" />
            <div className="font-bold">SALE RECEIPT</div>
            <div>{sale.ref}</div>
            <div>{fmtDateTime(sale.date)}</div>
          </div>
          <div className="border-t border-dashed border-black my-2" />
          <div>Customer: {sale.customer?.name || sale.customerName || "Walk-in"}</div>
          {(sale.customer?.phone || sale.customerPhone) && <div>Tel: {sale.customer?.phone || sale.customerPhone}</div>}
          <div className="border-t border-dashed border-black my-2" />
          {sale.items.map((it) => (
            <div key={it.id} className="flex justify-between">
              <span>{it.name} x{it.qty}</span>
              <span>{it.total.toLocaleString()}</span>
            </div>
          ))}
          <div className="border-t border-dashed border-black my-2" />
          {sale.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{sale.discount.toLocaleString()}</span></div>}
          <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>{sale.total.toLocaleString()} {s.currency}</span></div>
          <div className="flex justify-between"><span>Paid</span><span>{sale.paid.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Balance</span><span>{(sale.total - sale.paid).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Method</span><span>{sale.paymentMethod}</span></div>
          <div className="text-center font-bold mt-2">*** {cancelled ? "CANCELLED" : status} ***</div>
          <div className="border-t border-dashed border-black my-2" />
          <div className="text-center">{s.receiptFooter}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PrintToolbar />
      <div id="print-area" className="mx-auto bg-white p-10 max-w-[210mm] text-navy-950">
        <div className="flex justify-between items-start">
          <div>
            {s.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logoUrl} alt="logo" className="h-14 object-contain mb-2" />
            ) : (
              <div className="text-2xl font-bold text-navy-950">{s.showroomName}</div>
            )}
            {s.logoUrl && <div className="text-lg font-bold">{s.showroomName}</div>}
            <div className="text-sm text-slate-500">{s.address}</div>
            <div className="text-sm text-slate-500">{s.phone}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-wide">INVOICE</div>
            <div className="text-sm mt-1">{sale.ref}</div>
            <div className="text-sm text-slate-500">{fmtDateTime(sale.date)}</div>
            <div className="mt-3"><StatusStamp status={status} cancelled={cancelled} /></div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase text-slate-400 mb-1">Billed to</div>
            <div className="font-medium">{sale.customer?.name || sale.customerName || "Walk-in customer"}</div>
            <div className="text-sm text-slate-500">{sale.customer?.phone || sale.customerPhone}</div>
            <div className="text-sm text-slate-500">{sale.customer?.address}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase text-slate-400 mb-1">Payment</div>
            <div className="text-sm">Method: <b className="capitalize">{sale.paymentMethod}</b></div>
            {sale.dueDate && <div className="text-sm">Due date: <b>{fmtDateTime(sale.dueDate).split(" ")[0]}</b></div>}
          </div>
        </div>

        <table className="w-full mt-6">
          <thead>
            <tr className="border-b-2 border-navy-950">
              <th className="text-left py-2 text-xs uppercase text-slate-500">#</th>
              <th className="text-left py-2 text-xs uppercase text-slate-500">Item</th>
              <th className="text-right py-2 text-xs uppercase text-slate-500">Qty</th>
              <th className="text-right py-2 text-xs uppercase text-slate-500">Unit price</th>
              <th className="text-right py-2 text-xs uppercase text-slate-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it, i) => (
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
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{(sale.total + sale.discount).toLocaleString()} {s.currency}</span></div>
            {sale.discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>−{sale.discount.toLocaleString()}</span></div>}
            <div className="flex justify-between text-lg font-bold border-t-2 border-navy-950 pt-2"><span>Total</span><span>{sale.total.toLocaleString()} {s.currency}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Amount paid</span><span className="text-emerald-600 font-medium">{sale.paid.toLocaleString()} {s.currency}</span></div>
            <div className="flex justify-between font-semibold"><span>Balance due</span><span className={sale.total - sale.paid > 0 ? "text-red-600" : ""}>{(sale.total - sale.paid).toLocaleString()} {s.currency}</span></div>
          </div>
        </div>

        {sale.notes && <div className="mt-6 text-sm text-slate-600"><b>Notes:</b> {sale.notes}</div>}

        <div className="mt-16 flex justify-between text-sm">
          <div className="w-56 border-t border-slate-400 pt-2 text-center text-slate-500">Customer signature</div>
          <div className="w-56 border-t border-slate-400 pt-2 text-center text-slate-500">Authorized signature</div>
        </div>

        <div className="mt-10 text-center text-xs text-slate-400 border-t pt-4">{s.receiptFooter}</div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmt, getSettings } from "@/lib/utils";
import { saveSupplierAction } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { supplierOpeningDebts } from "@/lib/suppliers";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const q = sp.q || "";
  const suppliers: any[] = await prisma.$queryRaw`
    SELECT s.*,
      COALESCE((SELECT SUM(total) FROM "Purchase" p WHERE p."supplierId"=s.id AND p.status='confirmed'),0) as "totalPurchases",
      COALESCE((SELECT SUM(total-paid) FROM "Purchase" p WHERE p."supplierId"=s.id AND p.status='confirmed'),0) as balance,
      (SELECT COUNT(*) FROM "Product" pr WHERE pr."supplierId"=s.id) as "productCount"
    FROM "Supplier" s
    WHERE LOWER(s.name) LIKE LOWER(${"%" + q + "%"}) OR LOWER(s.phone) LIKE LOWER(${"%" + q + "%"})
    ORDER BY s.name`;
  const opening = new Map((await supplierOpeningDebts()).map(s => [s.supplierId, s.balance]));
  suppliers.forEach(s => { s.balance = Number(s.balance) + (opening.get(s.id) || 0); });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy-950">Suppliers</h1>
        <Link href="/suppliers?new=1" className="btn-primary">+ New supplier</Link>
      </div>

      {sp.new && (
        <form action={saveSupplierAction} className="card max-w-3xl p-5 space-y-5">
          <h2 className="font-semibold">New supplier</h2>
          <label className="block"><span className="label">Name</span><input name="name" required className="input" /></label>
          <label className="block"><span className="label">Opening balance owed ({settings.currency})</span><input name="openingBalance" type="number" min="0" step="0.01" defaultValue="0" required className="input" /><span className="mt-1 block text-xs text-slate-500">Amount you already owe this supplier. No cash movement is recorded.</span></label>
          <div className="flex gap-3"><SubmitButton>Save supplier</SubmitButton><Link href="/suppliers" className="btn-ghost">Cancel</Link></div>
        </form>
      )}

      <form className="card p-4 flex gap-3">
        <input name="q" type="search" aria-label="Search suppliers by name or phone" defaultValue={q} placeholder="Search name or phone…" className="input min-w-0 flex-1" />
        <button className="btn-ghost">Search</button>
        {q && <Link href="/suppliers" className="py-3 text-sm text-slate-500 underline">Clear</Link>}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr><th className="th">Name</th><th className="th">Phone</th><th className="th">Products</th>
              <th className="th">Total purchases</th><th className="th">Balance owed</th><th className="th"></th></tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="td font-medium"><Link href={`/suppliers/${s.id}`} className="text-navy-900 hover:underline">{s.name}</Link></td>
                <td className="td text-slate-500">{s.phone || "—"}</td>
                <td className="td">{Number(s.productCount)}</td>
                <td className="td">{fmt(Number(s.totalPurchases), settings.currency)}</td>
                <td className={`td font-medium ${Number(s.balance) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {fmt(Number(s.balance), settings.currency)}
                </td>
                <td className="td text-right"><Link href={`/suppliers/${s.id}`} className="text-sm text-emerald-600 font-medium">Profile →</Link></td>
              </tr>
            ))}
            {!suppliers.length && <tr><td colSpan={6} className="td text-center text-slate-400 py-8">No suppliers found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Alerts = {
  lowStock: number;
  overdueSales: number;
  overduePurchases: number;
  dueSoon: number;
};

export default function Header({ user, alerts }: { user: { name: string; role: string }; alerts: Alerts }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const section = pathname.split("/")[1];
  const title = section ? section.charAt(0).toUpperCase() + section.slice(1) : "Overview";
  const total = alerts.lowStock + alerts.overdueSales + alerts.overduePurchases + alerts.dueSoon;
  useEffect(() => {
    function dismiss(event: MouseEvent) { if (!panel.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  return <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-8 no-print">
    <div className="text-sm text-slate-500">Workspace <span className="mx-2 text-slate-300">/</span><span className="font-medium text-navy-950">{title}</span></div>
    <div className="flex items-center gap-4">
      <div className="relative" ref={panel}>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="workspace-alerts" className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-50">
          Alerts <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${total ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{total}</span>
        </button>
        {open && <div id="workspace-alerts" className="card absolute right-0 z-50 mt-3 w-[min(20rem,calc(100vw-2rem))] p-3 text-sm shadow-lg">
          <div className="px-3 py-2 font-semibold">Needs attention</div>
          {total === 0 && <p className="px-3 py-2 text-slate-500">You are all caught up.</p>}
          {alerts.lowStock > 0 && <Link href="/products?filter=low" className="block rounded-lg px-3 py-3 hover:bg-slate-50">{alerts.lowStock} products low on stock</Link>}
          {alerts.overdueSales > 0 && <Link href="/sales?filter=overdue" className="block rounded-lg px-3 py-3 hover:bg-slate-50">{alerts.overdueSales} overdue customer payments</Link>}
          {alerts.overduePurchases > 0 && <Link href="/purchases?filter=overdue" className="block rounded-lg px-3 py-3 hover:bg-slate-50">{alerts.overduePurchases} overdue supplier payments</Link>}
          {alerts.dueSoon > 0 && <p className="px-3 py-3 text-slate-500">{alerts.dueSoon} payments due within 3 days</p>}
        </div>}
      </div>
      <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
        <div aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-50 text-sm font-semibold text-navy-900">{user.name.charAt(0).toUpperCase()}</div>
        <div className="hidden text-sm sm:block"><div className="font-medium leading-tight">{user.name}</div><div className="text-xs capitalize text-slate-500">{user.role}</div></div>
      </div>
    </div>
  </header>;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const GROUPS = [
  { label: "Daily work", items: [["/", "Overview"], ["/sales", "Sales"], ["/caisse", "Caisse"], ["/expenses", "Expenses"]] },
  { label: "Manage", items: [["/products", "Products & stock"], ["/purchases", "Purchases"], ["/suppliers", "Suppliers"]] },
  { label: "Review", items: [["/payments", "Payment history"], ["/reports", "Reports"], ["/settings", "Settings"]] },
];

export default function Sidebar({ showroomName }: { showroomName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <aside className="w-full shrink-0 border-b border-blue-100 bg-gradient-to-b from-blue-50 via-white to-indigo-50 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:flex-col lg:border-b-0 lg:border-r no-print">
      <div className="flex items-center justify-between gap-4 px-5 py-5">
        <Link href="/" onClick={() => setOpen(false)} className="min-w-0">
          <div className="text-base font-bold tracking-tight text-navy-950 break-words">{showroomName}</div>
          <div className="mt-1 text-xs text-slate-500">Showroom workspace</div>
        </Link>
        <div className="lg:hidden"><button type="button" className="btn-ghost" aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button></div>
      </div>
      <div id="main-navigation" className={`${open ? "flex" : "hidden"} flex-col lg:flex lg:min-h-0 lg:flex-1`}>
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 pb-5">
          {GROUPS.map(group => <div key={group.label} className="mt-4 first:mt-1">
            <div className="px-3 pb-2 text-xs font-medium text-slate-400">{group.label}</div>
            <div className="space-y-1">{group.items.map(([href, label]) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? "bg-blue-600 font-semibold text-white shadow-sm" : "text-slate-600 hover:bg-blue-100 hover:text-blue-900"}`}>
                {label}{active && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              </Link>;
            })}</div>
          </div>)}
        </nav>
        <form action="/api/logout" method="post" className="border-t border-slate-100 p-3">
          <button className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-50">Sign out</button>
        </form>
      </div>
    </aside>
  );
}

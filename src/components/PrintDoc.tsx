"use client";

import { useEffect } from "react";

export function PrintToolbar({ auto }: { auto?: boolean }) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [auto]);
  return (
    <div className="no-print sticky top-0 bg-navy-950 text-white px-6 py-3 flex items-center gap-3 z-10">
      <button onClick={() => window.print()} className="btn-accent !py-1.5">🖨 Print / Save PDF</button>
      <button onClick={() => window.close()} className="btn-ghost !py-1.5">Close</button>
      <span className="text-xs text-white/60 ml-auto">Use the browser print dialog — choose "Save as PDF" for a PDF file.</span>
    </div>
  );
}

export function StatusStamp({ status, cancelled }: { status: string; cancelled?: boolean }) {
  const s = cancelled ? "CANCELLED" : status;
  const colors: Record<string, string> = {
    PAID: "border-emerald-600 text-emerald-600",
    "PARTIALLY PAID": "border-amber-500 text-amber-500",
    UNPAID: "border-red-500 text-red-500",
    CANCELLED: "border-slate-400 text-slate-400",
  };
  return (
    <div className={`inline-block border-3 rounded-lg px-4 py-1 font-bold text-lg tracking-widest rotate-[-4deg] ${colors[s]}`}
      style={{ borderWidth: 3 }}>
      {s}
    </div>
  );
}

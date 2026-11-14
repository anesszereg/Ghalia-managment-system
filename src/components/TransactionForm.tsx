"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createSaleAction, createPurchaseAction } from "@/lib/actions";
import SubmitButton from "./SubmitButton";

type Product = { id: number; name: string; sku: string; category: string; stock: number; sellingPrice: number; purchasePrice: number };
type Line = { productId: number; qty: string; unitPrice: string };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function TransactionForm({ mode, products, parties, currency, cashReady }: {
  mode: "sale" | "purchase";
  products: Product[];
  parties: { id: number; name: string; phone: string }[];
  currency: string;
  cashReady: boolean;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [paid, setPaid] = useState("0");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [resultLimit, setResultLimit] = useState(12);
  const [notice, setNotice] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const isSale = mode === "sale";
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const selected = new Map(lines.map(l => [l.productId, l]));
  const categories = useMemo(() => [...new Set(products.map(p => p.category))].sort(), [products]);
  const indexedProducts = useMemo(() => products.map(p => ({ product: p, text: normalize(`${p.name} ${p.sku}`), sku: normalize(p.sku) })), [products]);
  const matches = useMemo(() => {
    const query = normalize(search.trim());
    const terms = query.split(/\s+/).filter(Boolean);
    return indexedProducts.filter(p => (!category || p.product.category === category) && terms.every(term => p.text.includes(term)))
      .sort((a, b) => Number(b.sku === query) - Number(a.sku === query)).map(p => p.product);
  }, [indexedProducts, search, category]);
  const items = lines.map(l => ({ productId: l.productId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) }));
  const total = Math.round(items.reduce((sum, l) => sum + l.qty * l.unitPrice, 0) * 100) / 100;
  const actualPaid = cashReady ? Number(paid) : 0;
  const invalidPayment = cashReady && (paid === "" || !Number.isFinite(actualPaid) || actualPaid < 0 || actualPaid > total);
  const unitCount = items.reduce((sum, l) => sum + (Number.isSafeInteger(l.qty) && l.qty > 0 ? l.qty : 0), 0);
  const money = (value: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} ${currency}`;

  function lineError(line: Line) {
    const qty = Number(line.qty), price = Number(line.unitPrice);
    if (!Number.isSafeInteger(qty) || qty < 1) return "Enter a whole quantity greater than zero.";
    if (line.unitPrice === "" || !Number.isFinite(price) || price < 0) return "Enter a valid price of zero or more.";
    if (isSale && qty > (productMap.get(line.productId)?.stock ?? 0)) return `Only ${productMap.get(line.productId)?.stock ?? 0} in stock. Reduce the quantity.`;
    return null;
  }

  function addProduct(product: Product) {
    if (isSale && Number(selected.get(product.id)?.qty || 0) >= product.stock) {
      setNotice(`No more stock available for ${product.name}.`);
      return;
    }
    setLines(current => {
      const existing = current.find(l => l.productId === product.id);
      return existing ? current.map(l => l.productId === product.id ? { ...l, qty: String(Math.max(0, Math.trunc(Number(l.qty) || 0)) + 1) } : l)
        : [...current, { productId: product.id, qty: "1", unitPrice: String(isSale ? product.sellingPrice : product.purchasePrice) }];
    });
    setNotice(`${product.name} added to the order.`);
    searchRef.current?.focus();
    searchRef.current?.select();
  }

  function updateLine(productId: number, patch: Partial<Line>) {
    setLines(current => current.map(l => l.productId === productId ? { ...l, ...patch } : l));
  }

  const payload = JSON.stringify({ items, customerId: null, customerName: isSale ? "Vente comptoir" : undefined,
    supplierId: !isSale && partyId ? Number(partyId) : null,
    supplierName: !isSale ? parties.find(p => String(p.id) === partyId)?.name || "" : undefined,
    paid: actualPaid, paymentMethod: "cash" });
  const invalidLines = lines.some(l => lineError(l));

  return <form action={isSale ? createSaleAction : createPurchaseAction} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
    <input type="hidden" name="payload" value={payload} />
    <div className="min-w-0 space-y-5">
      <section className="card p-4 sm:p-5" aria-labelledby="product-picker-title">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="product-picker-title" className="font-semibold text-blue-900">Add products</h2><span className="text-xs text-slate-500">{products.length} in your catalog</span></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="min-w-0 flex-1 basis-48"><span className="sr-only">Search products</span><input ref={searchRef} type="search" className="input" placeholder="Search product name or SKU…" value={search} aria-describedby="product-search-help" aria-controls="product-results" onChange={e => { setSearch(e.target.value); setResultLimit(12); }} onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); if (matches[0]) addProduct(matches[0]); }
            if (e.key === "Escape") { setSearch(""); setResultLimit(12); }
          }} /></label>
          <label className="min-w-0"><span className="sr-only">Filter by category</span><select aria-label="Filter by category" className="input !w-auto max-w-full" value={category} onChange={e => { setCategory(e.target.value); setResultLimit(12); }}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
        </div>
        <p id="product-search-help" className="mt-2 text-xs text-slate-500">Click a product to add it. Press Enter to add the first match. Adding it again increases the quantity.</p>
        <div id="product-results" role="region" aria-label="Matching products" className="mt-3 max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-blue-100">
          <div className="grid sm:grid-cols-2">{matches.slice(0, resultLimit).map(p => {
            const qty = Number(selected.get(p.id)?.qty || 0);
            const unavailable = isSale && qty >= p.stock;
            return <button key={p.id} type="button" aria-label={`Add ${p.name}`} disabled={unavailable} onClick={() => addProduct(p)} className="min-w-0 border-b border-blue-50 p-3 text-left transition-colors hover:bg-blue-50 focus-visible:bg-blue-50 sm:odd:border-r">
              <span className="block truncate text-sm font-medium" title={p.name}>{p.name}</span>
              <span className="mt-1 flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs text-slate-500"><span>{p.sku}{isSale ? ` · ${p.stock} in stock` : ""}</span><span className="font-medium text-blue-700">{money(isSale ? p.sellingPrice : p.purchasePrice)}</span></span>
              {qty > 0 && <span className="mt-1 block text-xs font-medium text-emerald-700">In order: {qty}{unavailable ? " · stock limit reached" : ""}</span>}
            </button>;
          })}</div>
          {!matches.length && <div className="p-5 text-center text-sm text-slate-500">{products.length ? "No matching products. Try another name, SKU or category." : <>Your catalog is empty. <Link href="/products/new" className="text-blue-700 underline">Create a product</Link> first.</>}</div>}
          {matches.length > resultLimit && <button type="button" className="w-full p-3 text-sm font-medium text-blue-700 hover:bg-blue-50" onClick={() => setResultLimit(current => current + 12)}>Show more ({matches.length - resultLimit} remaining)</button>}
        </div>
        <p className="mt-2 text-xs text-slate-500">Showing {Math.min(resultLimit, matches.length)} of {matches.length} matches</p>
        <p role="status" aria-live="polite" className="sr-only">{notice}</p>
      </section>
      <section className="card overflow-hidden" aria-labelledby="order-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50/60 px-4 py-4 sm:px-5"><h2 id="order-title" className="font-semibold text-blue-900">Order items</h2><span className="text-sm text-slate-600">{lines.length} products · {unitCount} units</span></div>
        {!lines.length ? <div className="px-5 py-12 text-center"><p className="font-medium text-slate-700">Your order is empty</p><p className="mt-2 text-sm text-slate-500">Search above and click a product to add it.</p></div> : <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
          <div className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1fr)_112px_104px_100px_32px] gap-3 border-b border-blue-100 bg-white px-4 py-3 text-xs font-medium text-slate-500 sm:grid sm:px-5"><span>Product</span><span>Quantity</span><span>Unit price</span><span className="text-right">Total</span><span className="sr-only">Remove</span></div>
          {lines.map(line => {
            const product = productMap.get(line.productId)!;
            const qty = Number(line.qty), price = Number(line.unitPrice);
            const error = lineError(line);
            return <div key={line.productId} data-order-product={product.id} className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-3 border-b border-blue-50 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_112px_104px_100px_32px] sm:px-5">
              <div className="min-w-0"><p className="break-words text-sm font-medium">{product.name}</p><p className="mt-1 text-xs text-slate-500">{product.sku}{isSale ? ` · ${product.stock} in stock` : ""}</p></div>
              <div className="col-span-2 grid grid-cols-3 items-end gap-2 sm:contents">
                <div className="min-w-0"><span className="mb-1 block text-xs text-slate-500 sm:sr-only">Quantity</span><span className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-white"><button type="button" aria-label={`Decrease quantity for ${product.name}`} disabled={qty <= 1 || !Number.isFinite(qty)} className="w-7 shrink-0 self-stretch rounded-l-lg text-blue-700 hover:bg-blue-50" onClick={() => updateLine(product.id, { qty: String(Math.max(1, Math.trunc(qty) - 1)) })}>−</button><input type="number" min={1} max={isSale ? product.stock : undefined} step={1} required aria-label={`Quantity for ${product.name}`} aria-invalid={!!error} aria-describedby={error ? `line-error-${product.id}` : undefined} className="min-w-0 flex-1 bg-transparent py-2 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={line.qty} onChange={e => updateLine(product.id, { qty: e.target.value })} /><button type="button" aria-label={`Increase quantity for ${product.name}`} disabled={!Number.isFinite(qty) || (isSale && qty >= product.stock)} className="w-7 shrink-0 self-stretch rounded-r-lg text-blue-700 hover:bg-blue-50" onClick={() => updateLine(product.id, { qty: String(Math.max(1, Math.trunc(qty) + 1)) })}>+</button></span></div>
                <label className="min-w-0"><span className="mb-1 block text-xs text-slate-500 sm:sr-only">Unit price</span><input type="number" min={0} step="0.01" required aria-label={`Unit price for ${product.name}`} className="input !px-2" value={line.unitPrice} onChange={e => updateLine(product.id, { unitPrice: e.target.value })} /></label>
                <div className="min-w-0 pb-3 text-right text-sm font-medium tabular-nums"><span className="mb-1 block text-xs font-normal text-slate-500 sm:hidden">Total</span>{money(qty * price)}</div>
              </div>
              <button type="button" aria-label={`Remove ${product.name}`} onClick={() => { setLines(current => current.filter(l => l.productId !== product.id)); setNotice(`${product.name} removed from the order.`); }} className="col-start-2 row-start-1 flex h-9 w-8 items-center justify-center rounded-lg text-lg text-slate-400 hover:bg-red-50 hover:text-red-600 sm:col-start-5">×</button>
              {error && <p id={`line-error-${product.id}`} role="alert" className="col-span-2 text-xs text-red-700 sm:col-span-5">{error}</p>}
            </div>;
          })}
        </div>}
      </section>
    </div>
    <section className="card p-5 xl:sticky xl:top-6" aria-labelledby="order-summary-title">
      <h2 id="order-summary-title" className="font-semibold text-blue-900">{isSale ? "Sale summary" : "Purchase summary"}</h2>
      {!isSale && <div className="mt-5 border-b border-blue-100 pb-5"><label><span className="label">Supplier</span><select aria-label="Supplier" className="input" value={partyId} onChange={e => setPartyId(e.target.value)}><option value="">No supplier selected</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><Link href="/suppliers?new=1" className="mt-2 inline-block text-xs font-medium text-blue-700 underline">Add a supplier</Link></div>}
      <div className="mt-5 text-sm text-slate-500">{lines.length} products · {unitCount} units</div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xl font-bold"><span>Total</span><span>{money(total)}</span></div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2"><label htmlFor="cash-paid" className="text-sm font-medium text-slate-600">Cash paid now ({currency})</label>{cashReady && <button type="button" disabled={!lines.length || invalidLines} className="text-xs font-semibold text-blue-700 underline" onClick={() => setPaid(String(total))}>Pay in full</button>}</div>
      <input id="cash-paid" type="number" min={0} max={total} step="0.01" required className="input mt-2" value={cashReady ? paid : "0"} disabled={!cashReady} aria-invalid={invalidPayment} onChange={e => setPaid(e.target.value)} />
      {invalidPayment ? <p role="alert" className="mt-2 text-xs text-red-700">Enter a cash amount between 0 and the order total.</p> : cashReady ? <p className="mt-2 text-xs text-slate-500">Leave at 0 to record payment later.</p> : <p className="mt-2 text-xs text-amber-800">Caisse is closed. Save unpaid, or <Link href="/caisse" className="underline">open the caisse</Link> to record cash now.</p>}
      <div aria-live="polite" className="mt-5 flex flex-wrap justify-between gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><span>Still to {isSale ? "collect" : "pay"}</span><b>{money(Math.max(0, total - actualPaid))}</b></div>
      {invalidLines && <p role="alert" className="mt-3 text-xs text-red-700">Check the highlighted quantities and prices.</p>}
      <div className="mt-5"><SubmitButton className="btn-primary w-full" disabled={!lines.length || invalidLines || invalidPayment} pendingLabel={`Saving ${mode}…`}>{isSale ? "Confirm sale" : "Confirm purchase"}</SubmitButton></div>
      <Link href={isSale ? "/sales" : "/purchases"} className="mt-4 block py-2 text-center text-sm text-slate-500 hover:underline">Cancel</Link>
    </section>
  </form>;
}

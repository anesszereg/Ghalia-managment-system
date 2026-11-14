import Link from "next/link";
import { CATEGORIES } from "@/lib/utils";
import { createProductAction, updateProductAction } from "@/lib/actions";
import SubmitButton from "./SubmitButton";

export default async function ProductForm({ product }: { product?: any }) {
  const action = product ? updateProductAction : createProductAction;
  return <form action={action} className="max-w-3xl space-y-5">
    {product && <input type="hidden" name="id" value={product.id} />}
    <section className="card p-5 sm:p-6">
      <h2 className="font-semibold text-blue-900">Product details</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Product name</span><input name="name" required defaultValue={product?.name} className="input" /></label>
        <label><span className="label">SKU / reference</span><input name="sku" required defaultValue={product?.sku} className="input" /></label>
        <label className="sm:col-span-2"><span className="label">Category</span><select aria-label="Category" name="category" defaultValue={product?.category} className="input">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      </div>
    </section>
    <section className="card p-5 sm:p-6">
      <h2 className="font-semibold text-emerald-900">Prices & stock</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Purchase price</span><input name="purchasePrice" type="number" step="0.01" min="0" required defaultValue={product?.purchasePrice ?? 0} className="input" /></label>
        <label><span className="label">Selling price</span><input name="sellingPrice" type="number" step="0.01" min="0" required defaultValue={product?.sellingPrice ?? 0} className="input" /></label>
        {!product && <label><span className="label">Starting quantity</span><input name="stock" type="number" min="0" required defaultValue={0} className="input" /></label>}
      </div>
    </section>
    <div className="flex flex-wrap gap-3"><SubmitButton>{product ? "Save changes" : "Create product"}</SubmitButton><Link href={product ? `/products/${product.id}` : "/products"} className="btn-ghost">Cancel</Link></div>
  </form>;
}

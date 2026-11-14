import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ProductForm from "@/components/ProductForm";

export default async function EditProduct({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const product = await prisma.product.findUnique({ where: { id: Number(id) } });
  if (!product) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy-950">Edit — {product.name}</h1>
      {error && (
        <div className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">
          A product with this SKU already exists.
        </div>
      )}
      <ProductForm product={product} />
    </div>
  );
}

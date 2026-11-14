import ProductForm from "@/components/ProductForm";

export default async function NewProduct({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy-950">New product</h1>
      {error && (
        <div className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">
          {error === "sku" ? "A product with this SKU already exists." : "Name and SKU are required."}
        </div>
      )}
      <ProductForm />
    </div>
  );
}

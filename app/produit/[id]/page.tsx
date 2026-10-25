import { notFound } from "next/navigation";
import { getProduct, getProducts } from "@/lib/products";
import ProductView from "@/components/ProductView";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [p, products] = await Promise.all([
    getProduct(id),
    getProducts(true),
  ]);

  if (!p) {
    notFound();
  }

  return <ProductView p={p} products={products} />;
}

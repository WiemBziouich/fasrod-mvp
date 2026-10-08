import { notFound } from "next/navigation";
import { getProduct, getProducts } from "@/lib/products";
import ProductView from "@/components/ProductView";

export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  const p = getProduct(params.id);
  if (!p) notFound();
  return <ProductView p={p} products={getProducts(true)} />;
}

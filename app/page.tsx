import ProductGrid from "@/components/ProductGrid";
import { getProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

export default function Home() {
  return <ProductGrid products={getProducts(true)} />;
}

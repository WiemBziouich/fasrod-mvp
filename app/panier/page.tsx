import { getProducts } from "@/lib/products";
import CartPageClient from "@/components/CartPageClient";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const products = await getProducts(true);
  return <CartPageClient products={products} />;
}

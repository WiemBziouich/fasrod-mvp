import { getProducts } from "@/lib/products";
import CartPageClient from "@/components/CartPageClient";

export const dynamic = "force-dynamic";

export default function CartPage() {
  return <CartPageClient products={getProducts(true)} />;
}

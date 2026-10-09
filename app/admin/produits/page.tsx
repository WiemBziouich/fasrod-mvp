import { getProducts } from "@/lib/products";
import AdminProducts from "@/components/AdminProducts";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

export default function AdminProductsPage() {
  const products = getProducts();

  return (
    <main className="wrap">
      <AdminNav />
      <AdminProducts initialProducts={products} />
    </main>
  );
}
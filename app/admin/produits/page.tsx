import { getProducts } from "@/lib/products";
import AdminProducts from "@/components/AdminProducts";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await getProducts();

  return (
    <main className="wrap">
      <AdminNav />
      <AdminProducts initialProducts={products} />
    </main>
  );
}
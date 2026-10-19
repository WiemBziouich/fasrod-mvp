import ProductGrid from "@/components/ProductGrid";
import { getProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

function databaseIdentity( ) {
  const value = process.env.TURSO_DATABASE_URL;

  if (!value) return "missing";

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return "invalid";
  }
}

export default async function Home() {
  const products = await getProducts(true);

  console.info("[storefront-products]", {
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      "unknown",
    deployment:
      process.env.VERCEL_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      "unknown",
    database: databaseIdentity(),
    count: products.length,
    products: products.map(({ id, active }) => ({ id, active })),
  });

  return <ProductGrid products={products} />;
}

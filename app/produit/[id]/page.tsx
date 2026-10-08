import { notFound } from "next/navigation";
import { getProduct } from "@/lib/data";
import ProductView from "@/components/ProductView";

export default function Page({ params }: { params: { id: string } }) {
  const p = getProduct(params.id);
  if (!p) notFound();
  return <ProductView p={p} />;
}

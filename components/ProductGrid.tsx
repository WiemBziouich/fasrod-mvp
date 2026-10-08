"use client";
import Link from "next/link";
import { PRODUCTS } from "@/lib/data";
import { useI18n } from "./I18n";

export default function ProductGrid() {
  const { t, lang } = useI18n();
  return (
    <main className="wrap">
      <h1>{t("all")}</h1>
      <div className="grid">
        {PRODUCTS.map((p) => (
          <Link key={p.id} href={`/produit/${p.id}`} className="card">
            <img src={p.images[0]} alt={p.name} loading="lazy" />
            <div className="info"><span className="muted">{p.category}</span><b>{p.name}</b><span>{p.price} DT</span></div>
          </Link>
        ))}
      </div>
    </main>
  );
}

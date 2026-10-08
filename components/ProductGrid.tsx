"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";

import { Product } from "@/lib/data";
import { useI18n } from "./I18n";

export default function ProductGrid({ products }: { products: Product[] }) {
  const { t } = useI18n();

  const [search, setSearch] = useState("");

  const filteredProducts = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(value) ||
        product.category.toLowerCase().includes(value) ||
        product.desc.fr.toLowerCase().includes(value) ||
        product.desc.ar.toLowerCase().includes(value)
      );
    });
  }, [products, search]);

  return (
    <main className="wrap">

      <section className="catalog-header">

        <div>
          <p className="eyebrow">
            FASROD
          </p>

          <h1>
            {t("all")}
          </h1>

          <p className="muted catalog-count">
            {filteredProducts.length} {t("products")}
          </p>
        </div>

        <div className="search-box">

          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M21 21L16.65 16.65M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />

          {search && (
            <button
              type="button"
              className="clear-search"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}

        </div>

      </section>

      {filteredProducts.length > 0 ? (

        <div className="grid">

          {filteredProducts.map((p) => (

            <Link
              key={p.id}
              href={`/produit/${p.id}`}
              className="card"
            >

              <div className="card-image">

                <Image
                  src={p.images[0]}
                  alt={p.name}
                  fill
                  sizes="(max-width: 760px) 50vw, 260px"
                />

              </div>

              <div className="info">

                <span className="muted category">
                  {p.category}
                </span>

                <b className="product-name">
                  {p.name}
                </b>

                <div className="product-bottom">

                  <span>
                    {p.price} DT
                  </span>

                  <span className="arrow">
                    →
                  </span>

                </div>

              </div>

            </Link>

          ))}

        </div>

      ) : (

        <div className="empty-search">

          <div className="empty-icon">
            🔎
          </div>

          <h2>
            {t("noResults")}
          </h2>

          <p className="muted">
            {t("noResultsText")}
          </p>

          <button
            className="btn"
            onClick={() => setSearch("")}
          >
            {t("showAll")}
          </button>

        </div>

      )}

    </main>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import {
  Product,
  MAX_QTY,
  SIZE_GUIDE,
} from "@/lib/data";

import { useI18n } from "./I18n";
import { useCart } from "./CartContext";

export default function ProductView({
  p,
  products,
}: {
  p: Product;
  products: Product[];
}) {
  const { t, lang } = useI18n();
  const { addItem } = useCart();
  const [cartMessage, setCartMessage] = useState("");
  
const [liveProduct, setLiveProduct] = useState(p);
const [liveProducts, setLiveProducts] = useState<Product[]>([]);
const currentProduct = liveProduct;

useEffect(() => {
  let cancelled = false;

  async function refreshProduct() {
    try {
      const response = await fetch("/api/products", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Erreur API : ${response.status}`);
      }

      const items: Product[] = await response.json();
      const latest = items.find((item) => item.id === p.id);

      if (!cancelled) {
  setLiveProducts(items);
}

      if (!cancelled && latest) {
        setLiveProduct(latest);
      }
    } catch (error) {
      console.error("Erreur de mise à jour du produit :", error);
    }
  }

  refreshProduct();

  return () => {
    cancelled = true;
  };
}, [p.id]);

  
  const [img, setImg] = useState(0);
  const [color, setColor] = useState(p.colors[0].name);
  const [size, setSize] = useState(p.sizes[0]);
  const [qty, setQty] = useState(1);
  
const selectedColor = p.colors.find((c) => c.name === color);

const galleryImages =
  selectedColor?.images?.length
    ? selectedColor.images
    : p.images?.length
      ? p.images
      : p.colors.flatMap((c) => c.images ?? []);

useEffect(() => {
  setImg(0);
}, [color]);
  

useEffect(() => {
  if (!currentProduct.colors.some((c) => c.name === color)) {
    setColor(currentProduct.colors[0]?.name ?? "");
  }

  if (!currentProduct.sizes.includes(size)) {
    setSize(currentProduct.sizes[0] ?? "");
  }
}, [currentProduct, color, size]);

  
useEffect(() => {
  if (img >= galleryImages.length) {
    setImg(0);
  }
}, [img, galleryImages.length]);

  const relatedProducts = useMemo(() => {
  const sameCategory = liveProducts.filter(
    (product) =>
      product.id !== currentProduct.id &&
      product.category === currentProduct.category
  );

  if (sameCategory.length >= 4) {
    return sameCategory.slice(0, 4);
  }

  const others = liveProducts.filter(
    (product) =>
      product.id !== currentProduct.id &&
      product.category !== currentProduct.category
  );

  return [...sameCategory, ...others].slice(0, 4);
}, [currentProduct.id, currentProduct.category, liveProducts]);

    return [...sameCategory, ...others].slice(0, 4);
  }, [p.id, p.category, products]);

  return (
    <main className="wrap">

      <Link
        href="/"
        className="back-link muted"
      >
        ← {t("back")}
      </Link>

      <div className="pdp">

        {/* IMAGE */}

        <div>

          <div className="product-main-image">

            <Image
              className="main"
              src={galleryImages[img] || p.images[0]}
              alt={p.name}
              fill
              priority
              sizes="(max-width: 760px) 100vw, 50vw"
            />

          </div>

          <div className="thumbs">

            {galleryImages.map((s, i) => (

              <button
                key={s}
                type="button"
                className={
                  i === img
                    ? "thumb-button on"
                    : "thumb-button"
                }
                onClick={() => setImg(i)}
              >

                <Image
                  src={s}
                  alt={`${p.name} ${i + 1}`}
                  fill
                  sizes="70px"
                />

              </button>

            ))}

          </div>

        </div>

        {/* INFO */}

        <div>

          <span className="muted product-category">
            {p.category}
          </span>

          <h1 className="product-title">
            {p.name}
          </h1>

          <p className="price">
            {p.price} DT
          </p>

          <p className="muted product-description">
            {p.desc[lang]}
          </p>

          <div className="product-divider" />

          {/* COLOR */}

          <h3>
            {t("color")}{" "}
            <span className="muted">
              {color}
            </span>
          </h3>

          <div className="row">

            {p.colors.map((c) => (

              <button
                key={c.name}
                type="button"
                aria-label={c.name}
                className={
                  "dot" +
                  (c.name === color ? " on" : "")
                }
                style={{
                  background: c.hex,
                }}
                onClick={() =>
                  setColor(c.name)
                }
              />

            ))}

          </div>

          {/* SIZE */}

          <h3>
            {t("size")}
          </h3>

          <p className="size-guide" aria-label="Guide des tailles">
            Guide : XS = 34 · S = 36 · M = 38 · L = 40 · XL = 42 · XXL = 44
          </p>

          <div className="row">

            {p.sizes.map((s) => (

              <button
                key={s}
                type="button"
                className={
                  "chip" +
                  (s === size ? " on" : "")
                }
                onClick={() =>
                  setSize(s)
                }
                aria-label={`Taille ${s}${SIZE_GUIDE[s] ? `, équivalent ${SIZE_GUIDE[s]}` : ""}`}
              >
                <span className="size-chip-number">{SIZE_GUIDE[s] ?? "—"}</span>
                <span>{s}</span>
              </button>

            ))}

          </div>

          {/* QUANTITY */}

          <h3>
            {t("qty")}
          </h3>

          <div className="row">

            {Array.from(
              { length: MAX_QTY },
              (_, i) => i + 1
            ).map((n) => (

              <button
                key={n}
                type="button"
                className={
                  "chip" +
                  (n === qty ? " on" : "")
                }
                onClick={() =>
                  setQty(n)
                }
              >
                {n}
              </button>

            ))}

          </div>

          <div className="form">
            <h2>Ajouter au panier</h2>

            <p>
              {p.name} × {qty} — {p.price * qty} DT
            </p>

            <p className="muted">
              Les frais de livraison seront ajoutés une seule fois lors de la validation.
            </p>

            {cartMessage && (
              <p role="status" className="muted">
                {cartMessage}
              </p>
            )}

            <button
              type="button"
              className="btn big"
              onClick={() => {
                addItem({
                  productId: p.id,
                  color,
                  size,
                  qty,
                });
                setCartMessage("Article ajouté au panier.");
              }}
            >
              Ajouter au panier
            </button>

            <Link href="/panier" className="btn big">
              Voir le panier
            </Link>
          </div>

        </div>

      </div>

      {/* RELATED PRODUCTS */}

      {relatedProducts.length > 0 && (

        <section className="related">

          <div className="related-header">

            <div>
              <p className="eyebrow">
                FASROD
              </p>

              <h2>
                {t("related")}
              </h2>

              <p className="muted">
                {t("relatedText")}
              </p>
            </div>

            <Link
              href="/"
              className="related-link"
            >
              {t("viewAll")} →
            </Link>

          </div>

          <div className="grid related-grid">

            {relatedProducts.map(
              (product) => (

                <Link
                  key={product.id}
                  href={`/produit/${product.id}`}
                  className="card"
                >

                  <div className="card-image">

                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      fill
                      sizes="(max-width: 760px) 50vw, 260px"
                    />

                  </div>

                  <div className="info">

                    <span className="muted category">
                      {product.category}
                    </span>

                    <b className="product-name">
                      {product.name}
                    </b>

                    <div className="product-bottom">

                      <span>
                        {product.price} DT
                      </span>

                      <span className="arrow">
                        →
                      </span>

                    </div>

                  </div>

                </Link>

              )
            )}

          </div>

        </section>

      )}

    </main>
  );
}

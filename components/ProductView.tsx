
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { Product, MAX_QTY, SIZE_GUIDE } from "@/lib/data";
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
  const [liveProducts, setLiveProducts] = useState<Product[]>(products);
  const [img, setImg] = useState(0);
  const [color, setColor] = useState(p.colors[0]?.name ?? "");
  const [size, setSize] = useState(p.sizes[0] ?? "");
  const [qty, setQty] = useState(1);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const currentProduct = liveProduct;

  useEffect(() => {
    let cancelled = false;

    async function refreshProducts() {
      try {
        const response = await fetch("/api/products", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Erreur API : ${response.status}`);
        }

        const items: Product[] = await response.json();

        if (!cancelled && Array.isArray(items)) {
          setLiveProducts(items);

          const latest = items.find((item) => item.id === p.id);

          if (latest) {
            setLiveProduct(latest);
          }
        }
      } catch (error) {
        console.error("Actualisation des produits échouée :", error);
      }
    }

    void refreshProducts();

    return () => {
      cancelled = true;
    };
  }, [p.id]);

  const selectedColor = currentProduct.colors.find(
    (item) => item.name === color
  );

  const galleryImages = selectedColor?.images?.length
    ? selectedColor.images
    : currentProduct.images?.length
      ? currentProduct.images
      : [];

  useEffect(() => {
    setImg(0);
  }, [color]);

  useEffect(() => {
    if (!currentProduct.colors.some((item) => item.name === color)) {
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
    const available = liveProducts.filter(
      (product) => product.id !== currentProduct.id
    );

    const sameCategory = available.filter(
      (product) => product.category === currentProduct.category
    );

    const others = available.filter(
      (product) => product.category !== currentProduct.category
    );

    return [...sameCategory, ...others].slice(0, 4);
  }, [currentProduct.id, currentProduct.category, liveProducts]);

  function handleAddToCart() {
    addItem({
      productId: currentProduct.id,
      color,
      size,
      qty,
    });

    setCartMessage("Article ajouté au panier.");
  }

  return (
    <main className="wrap product-page">
      <Link href="/" className="back-link muted">
        ← {t("back")}
      </Link>

      <div className="pdp">
        {/* 1. Galerie principale */}
        <div className="product-gallery">
          <div className="product-main-image">
            {galleryImages.length > 0 && (
              <Image
                className="main"
                src={galleryImages[img] || currentProduct.images[0]}
                alt={`${currentProduct.name} - ${color}`}
                fill
                priority
                sizes="(max-width: 760px) 100vw, 50vw"
              />
            )}
          </div>

          {/* 2. Une miniature par couleur */}
          <div className="thumbs color-thumbnails">
            {currentProduct.colors.map((item) => {
              const thumbnail =
                item.images?.[0] || currentProduct.images[0];

              return (
                <button
                  key={item.name}
                  type="button"
                  className={
                    "thumb-button color-thumbnail" +
                    (item.name === color ? " on" : "")
                  }
                  onClick={() => {
                    setColor(item.name);
                    setImg(0);
                  }}
                  aria-label={`Choisir la couleur ${item.name}`}
                  aria-pressed={item.name === color}
                  title={item.name}
                >
                  {thumbnail && (
                    <Image
                      src={thumbnail}
                      alt={item.name}
                      fill
                      sizes="64px"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Informations produit */}
        <div className="product-info">
          {/* 3. Nom et prix */}
            <div className="mobile-product-heading">
               <span className="muted product-category">
                  {currentProduct.category}
                </span>

              <h1 className="product-title">
                {currentProduct.name}
              </h1>

              <p className="price">{currentProduct.price} DT</p>

              <p className="muted product-description desktop-description">
                {currentProduct.desc[lang]}
              </p>
            </div>

          {/* 4. Couleur */}
          <section className="mobile-color-section">
            <h3>
              {t("color")}{" "}
              <span className="muted">{color}</span>
            </h3>

            <div className="row">
              {currentProduct.colors.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  aria-label={`Choisir ${item.name}`}
                  aria-pressed={item.name === color}
                  title={item.name}
                  className={
                    "dot" + (item.name === color ? " on" : "")
                  }
                  style={{ background: item.hex }}
                  onClick={() => {
                    setColor(item.name);
                    setImg(0);
                  }}
                />
              ))}
            </div>
          </section>

          {/* 5. Taille et quantité */}
          <section className="mobile-options">
            <h3>{t("size")}</h3>

            <p className="size-guide" aria-label="Guide des tailles">
              Guide : XS = 34 · S = 36 · M = 38 · L = 40 · XL = 42 · XXL = 44
            </p>

            <div className="row">
              {currentProduct.sizes.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={
                    "chip" + (item === size ? " on" : "")
                  }
                  onClick={() => setSize(item)}
                  aria-label={`Taille ${item}${
                    SIZE_GUIDE[item]
                      ? `, équivalent ${SIZE_GUIDE[item]}`
                      : ""
                  }`}
                >
                  <span className="size-chip-number">
                    {SIZE_GUIDE[item] ?? "—"}
                  </span>
                  <span>{item}</span>
                </button>
              ))}
            </div>

            <h3>{t("qty")}</h3>

            <div className="row">
              {Array.from(
                { length: MAX_QTY },
                (_, index) => index + 1
              ).map((number) => (
                <button
                  key={number}
                  type="button"
                  className={
                    "chip" + (number === qty ? " on" : "")
                  }
                  onClick={() => setQty(number)}
                  aria-pressed={number === qty}
                >
                  {number}
                </button>
              ))}
            </div>
          </section>

          {/* 6. Description repliable sur mobile */}
          <section className="mobile-description">
  <p className="muted product-description desktop-description">
    {currentProduct.desc[lang]}
  </p>

  <button
    type="button"
    className="description-toggle"
    aria-expanded={descriptionOpen}
    onClick={() => setDescriptionOpen((open) => !open)}
  >
    <span>
      {t("details") === "details"
        ? "Détails du produit"
        : t("details")}
    </span>
    <span aria-hidden="true">
      {descriptionOpen ? "−" : "+"}
    </span>
  </button>

  <div
    className={
      "description-content" +
      (descriptionOpen ? " is-open" : "")
    }
  >
    <p className="muted product-description">
      {currentProduct.desc[lang]}
    </p>
  </div>
</section>

          {/* Achat principal pour ordinateur et bas de page */}
          <div className="form desktop-cart-form">
            <h2>Ajouter au panier</h2>

            <p>
              {currentProduct.name} × {qty} —{" "}
              {currentProduct.price * qty} DT
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
              onClick={handleAddToCart}
            >
              Ajouter au panier
            </button>

            <Link href="/panier" className="btn big">
              Voir le panier
            </Link>
          </div>
        </div>
      </div>

      {/* 7. Barre fixe mobile */}
      <div className="mobile-sticky-cart">
        <div className="mobile-sticky-info">
          <span>{currentProduct.name}</span>
          <strong>{currentProduct.price * qty} DT</strong>
        </div>

        <button
          type="button"
          className="btn mobile-sticky-button"
          onClick={handleAddToCart}
        >
          Ajouter au panier
        </button>
      </div>

      {/* Recommandations */}
      {relatedProducts.length > 0 && (
        <section className="related">
          <div className="related-header">
            <div>
              <p className="eyebrow">FASROD</p>
              <h2>{t("related")}</h2>
              <p className="muted">{t("relatedText")}</p>
            </div>

            <Link href="/" className="related-link">
              {t("viewAll")} →
            </Link>
          </div>

          <div className="grid related-grid">
            {relatedProducts.map((product) => (
              <Link
                key={product.id}
                href={`/produit/${product.id}`}
                className="card"
              >
                <div className="card-image">
                  {product.images?.[0] && (
                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      fill
                      sizes="(max-width: 760px) 50vw, 260px"
                    />
                  )}
                </div>

                <div className="info">
                  <span className="muted category">
                    {product.category}
                  </span>

                  <b className="product-name">{product.name}</b>

                  <div className="product-bottom">
                    <span>{product.price} DT</span>
                    <span className="arrow">→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

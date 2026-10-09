"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";

import {
  Product,
  WILAYAS,
  DELIVERY_FEE,
  MAX_QTY,
} from "@/lib/data";

import { useI18n } from "./I18n";

export default function ProductView({
  p,
  products,
}: {
  p: Product;
  products: Product[];
}) {
  const { t, lang } = useI18n();

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
  if (img >= galleryImages.length) {
    setImg(0);
  }
}, [img, galleryImages.length]);


  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<number | null>(null);

  const total = p.price * qty + DELIVERY_FEE;

  const relatedProducts = useMemo(() => {
    const sameCategory = products.filter(
      (product) =>
        product.id !== p.id &&
        product.category === p.category
    );

    if (sameCategory.length >= 4) {
      return sameCategory.slice(0, 4);
    }

    const others = products.filter(
      (product) =>
        product.id !== p.id &&
        product.category !== p.category
    );

    return [...sameCategory, ...others].slice(0, 4);
  }, [p.id, p.category, products]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setBusy(true);
    setErr("");

    const f: Record<string, FormDataEntryValue> = {};
    new FormData(e.currentTarget).forEach((value, key) => {
      f[key] = value;
    });

    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...f,
          productId: p.id,
          color,
          size,
          qty,
        }),
      });

      const d = await r.json();

      if (d.ok) {
        setDone(d.id);
      } else {
        setErr(t("e_" + d.error));
      }
    } catch {
      setErr(t("e_net"));
    }

    setBusy(false);
  }

  if (done !== null) {
    return (
      <main className="wrap ok">

        <div className="success-icon">
          ✓
        </div>

        <h1>
          {t("okTitle")}
        </h1>

        <p>
          {t("okText")}{" "}
          <b>#{done}</b>
        </p>

        <Link className="btn" href="/">
          {t("again")}
        </Link>

      </main>
    );
  }

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
              >
                {s}
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

          {/* FORM */}

          <form
            onSubmit={submit}
            className="form"
          >

            <h2>
              {t("formTitle")}
            </h2>

            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="hp"
              aria-hidden
            />

            <input
              name="name"
              required
              minLength={3}
              placeholder={t("name")}
              autoComplete="name"
            />

            <input
              name="phone"
              required
              type="tel"
              inputMode="tel"
              placeholder={t("phone")}
              autoComplete="tel"
            />

            <input
              name="phone2"
              type="tel"
              inputMode="tel"
              placeholder={t("phone2")}
            />

            <select
              name="governorate"
              required
              defaultValue=""
            >
              <option
                value=""
                disabled
              >
                {t("wilaya")}
              </option>

              {WILAYAS.map((w) => (
                <option
                  key={w.v}
                  value={w.v}
                >
                  {lang === "ar"
                    ? w.ar
                    : w.v}
                </option>
              ))}
            </select>

            <input
              name="city"
              required
              placeholder={t("city")}
            />

            <textarea
              name="address"
              required
              rows={2}
              placeholder={t("address")}
            />

            <div className="sum">

              <span>
                {p.name} × {qty}
              </span>

              <span>
                {p.price * qty} DT
              </span>

              <span>
                {t("delivery")}{" "}
                <small className="muted">
                  ({t("deliveryNote")})
                </small>
              </span>

              <span>
                {DELIVERY_FEE} DT
              </span>

              <b>
                {t("total")}
              </b>

              <b>
                {total} DT
              </b>

            </div>

            <p className="muted">
              {t("cod")}
            </p>

            {err && (
              <p className="err">
                {err}
              </p>
            )}

            <button
              className="btn big"
              disabled={busy}
            >
              {busy
                ? t("sending")
                : t("submit")}
            </button>

          </form>

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
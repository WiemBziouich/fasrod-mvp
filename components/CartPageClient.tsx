"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { DELIVERY_FEE, MAX_QTY, WILAYAS, type Product } from "@/lib/data";
import { useCart, cartKey } from "./CartContext";
import { useI18n } from "./I18n";

export default function CartPageClient({ products }: { products: Product[] }) {
  const { items, ready, updateQty, removeItem, clear } = useCart();
  const { lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<number | null>(null);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const lines = items.map((item) => ({
    ...item,
    product: productMap.get(item.productId),
  }));

  const subtotal = lines.reduce(
    (sum, line) => sum + (line.product?.price ?? 0) * line.qty,
    0
  );
  const total = subtotal + (items.length ? DELIVERY_FEE : 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !items.length) return;

    setBusy(true);
    setError("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const customer: Record<string, string> = {};
    data.forEach((value, key) => {
      customer[key] = String(value);
    });

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...customer,
          items: items.map(({ productId, color, size, qty }) => ({
            productId,
            color,
            size,
            qty,
          })),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        const messages: Record<string, string> = {
          invalid: "Un article, une couleur, une taille ou une quantité est invalide. Vérifie le panier.",
          phone: "Vérifie les numéros de téléphone : 8 chiffres sont requis.",
          fields: "Vérifie le nom, l'adresse, la ville et le gouvernorat.",
          rate: "Trop de commandes. Réessaie dans quelques minutes.",
          empty: "Ton panier est vide.",
          unavailable: "Un article n'est plus disponible. Actualise le panier.",
          order_failed: "La commande n'a pas pu être enregistrée. Réessaie.",
        };
        throw new Error(messages[result.error] || "Une erreur est survenue.");
      }

      setOrderId(Number(result.id));
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Problème de connexion.");
    } finally {
      setBusy(false);
    }
  }

  if (orderId !== null) {
    return (
      <main className="wrap ok">
        <div className="success-icon">✓</div>
        <h1>Commande reçue !</h1>
        <p>
          Nous allons te contacter pour confirmer la commande.
          Numéro : <strong>#{orderId}</strong>
        </p>
        <Link className="btn" href="/">Retour à la boutique</Link>
      </main>
    );
  }

  if (!ready) {
    return <main className="wrap"><p>Chargement du panier…</p></main>;
  }

  return (
    <main className="wrap">
      <Link href="/" className="back-link muted">← Continuer les achats</Link>
      <h1>Mon panier</h1>

      {!items.length ? (
        <div className="form">
          <p>Ton panier est vide.</p>
          <Link href="/" className="btn">Découvrir les articles</Link>
        </div>
      ) : (
        <>
          <div className="form">
            {lines.map((line) => {
              const key = cartKey(line);

              if (!line.product) {
                return (
                  <div key={key}>
                    <p>Un article n'est plus disponible.</p>
                    <button type="button" className="btn" onClick={() => removeItem(key)}>
                      Retirer
                    </button>
                  </div>
                );
              }

              const colorExists = line.product.colors.some(
                (color) => color.name === line.color
              );
              const sizeExists = line.product.sizes.includes(line.size);

              return (
                <div key={key} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 16 }}>
                  <h3>{line.product.name}</h3>
                  <p className="muted">
                    Couleur : {line.color} · Taille : {line.size}
                  </p>
                  {(!colorExists || !sizeExists) && (
                    <p className="err">Cette variante n'est plus disponible. Retire-la du panier.</p>
                  )}
                  <p>{line.product.price} DT × {line.qty} = {line.product.price * line.qty} DT</p>
                  <div className="row">
                    <label>
                      Quantité
                      <select
                        value={line.qty}
                        disabled={busy}
                        onChange={(e) => updateQty(key, Number(e.target.value))}
                      >
                        {Array.from({ length: MAX_QTY }, (_, i) => i + 1).map((qty) => (
                          <option key={qty} value={qty}>{qty}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => removeItem(key)}
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="sum">
              <span>Sous-total des articles</span><strong>{subtotal} DT</strong>
              <span>Livraison</span><strong>{items.length ? DELIVERY_FEE : 0} DT</strong>
              <b>Total à payer</b><b>{total} DT</b>
            </div>
          </div>

          <form className="form" onSubmit={submit}>
            <h2>Coordonnées de livraison</h2>
            <input name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden />

            <input name="name" required minLength={3} maxLength={80} placeholder="Nom et prénom" autoComplete="name" />
            <input name="phone" required type="tel" inputMode="tel" placeholder="Téléphone (8 chiffres)" autoComplete="tel" />
            <input name="phone2" type="tel" inputMode="tel" placeholder="Deuxième téléphone (facultatif)" />

            <select name="governorate" required defaultValue="">
              <option value="" disabled>Choisir le gouvernorat</option>
              {WILAYAS.map((wilaya) => (
                <option key={wilaya.v} value={wilaya.v}>
                  {lang === "ar" ? wilaya.ar : wilaya.v}
                </option>
              ))}
            </select>

            <input name="city" required minLength={2} maxLength={60} placeholder="Ville / délégation" />
            <textarea name="address" required minLength={5} maxLength={200} rows={3} placeholder="Adresse complète" />

            <p className="muted">Paiement à la livraison. Les prix seront vérifiés par le serveur.</p>
            {error && <p role="alert" className="err">{error}</p>}

            <button className="btn big" type="submit" disabled={busy || !items.length}>
              {busy ? "Envoi en cours…" : `Confirmer la commande — ${total} DT`}
            </button>
          </form>
        </>
      )}
    </main>
  );
}

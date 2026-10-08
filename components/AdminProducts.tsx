"use client";

import { FormEvent, useState } from "react";
import { Product } from "@/lib/data";

type FormState = {
  id: string;
  name: string;
  category: string;
  price: string;
  descFr: string;
  descAr: string;
  images: string;
  colors: string;
  sizes: string;
  active: boolean;
};

const blank = (): FormState => ({
  id: "", name: "", category: "", price: "", descFr: "", descAr: "",
  images: "", colors: "", sizes: "", active: true,
});

const fromProduct = (p: Product): FormState => ({
  id: p.id, name: p.name, category: p.category, price: String(p.price),
  descFr: p.desc.fr, descAr: p.desc.ar, images: p.images.join("\n"),
  colors: p.colors.map((c) => `${c.name}|${c.hex}`).join("\n"),
  sizes: p.sizes.join(", "), active: p.active,
});

const toPayload = (form: FormState) => ({
  id: form.id,
  name: form.name,
  category: form.category,
  price: form.price,
  descFr: form.descFr,
  descAr: form.descAr,
  images: form.images.split("\n").map((v) => v.trim()).filter(Boolean),
  colors: form.colors.split("\n").map((v) => {
    const [name, hex] = v.split("|");
    return { name: name?.trim(), hex: hex?.trim() };
  }).filter((c) => c.name && c.hex),
  sizes: form.sizes.split(",").map((v) => v.trim()).filter(Boolean),
  active: form.active,
});

export default function AdminProducts({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [form, setForm] = useState<FormState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function edit(product?: Product) {
    setMessage("");
    setForm(product ? fromProduct(product) : blank());
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setMessage("");
    const editing = products.some((p) => p.id === form.id);
    const response = await fetch(editing ? `/api/admin/products/${form.id}` : "/api/admin/products", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(form)),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error === "exists" ? "Cet identifiant existe déjà." : "Vérifiez les champs du produit.");
      setBusy(false);
      return;
    }
    const updated: Product = { ...toPayload(form), price: Number(form.price), desc: { fr: form.descFr, ar: form.descAr } } as Product;
    setProducts(editing ? products.map((p) => p.id === updated.id ? updated : p) : [...products, updated]);
    setForm(null);
    setMessage("Produit enregistré.");
    setBusy(false);
  }

  async function toggle(product: Product) {
    const response = await fetch(`/api/admin/products/${product.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(fromProduct({ ...product, active: !product.active }))),
    });
    if (!response.ok) {
      setMessage("Impossible de modifier le statut.");
      return;
    }
    setProducts(products.map((p) => p.id === product.id ? { ...p, active: !p.active } : p));
  }

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <h2>Produits</h2>
        <button className="btn" type="button" onClick={() => edit()}>Ajouter un produit</button>
      </div>
      {message && <p className="muted">{message}</p>}
      {form && (
        <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 700, margin: "20px 0 35px" }}>
          <input required disabled={products.some((p) => p.id === form.id)} placeholder="Identifiant (ex: sweat-noir)" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
          <input required placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required placeholder="Catégorie" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input required min="0" type="number" placeholder="Prix (DT)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <textarea required placeholder="Description française" value={form.descFr} onChange={(e) => setForm({ ...form, descFr: e.target.value })} />
          <textarea required placeholder="Description arabe" value={form.descAr} onChange={(e) => setForm({ ...form, descAr: e.target.value })} />
          <textarea required placeholder="Images: une URL par ligne" value={form.images} onChange={(e) => setForm({ ...form, images: e.target.value })} />
          <textarea required placeholder={"Couleurs: une par ligne, ex: Noir|#111111"} value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} />
          <input required placeholder="Tailles séparées par des virgules (XS, S, M)" value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} />
          <label><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Produit actif</label>
          <div><button className="btn" disabled={busy}>{busy ? "Enregistrement..." : "Enregistrer"}</button>{" "}<button type="button" onClick={() => setForm(null)}>Annuler</button></div>
        </form>
      )}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Produit</th><th>Prix</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>{products.map((p) => (
            <tr key={p.id}><td>{p.name}<br /><span className="muted">{p.id}</span></td><td>{p.price} DT</td>
              <td>{p.active ? "Actif" : "Désactivé"}</td><td><button type="button" onClick={() => edit(p)}>Modifier</button>{" "}<button type="button" onClick={() => toggle(p)}>{p.active ? "Désactiver" : "Activer"}</button></td></tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

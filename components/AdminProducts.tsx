"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Product, ProductColor } from "@/lib/data";

type Variant = {
  key: string;
  name: string;
  hex: string;
  images: string[];
};

type FormState = {
  id: string;
  name: string;
  category: string;
  price: string;
  descFr: string;
  descAr: string;
  variants: Variant[];
  sizes: string;
  active: boolean;
};

const makeVariant = (): Variant => ({
  key: `${Date.now()}-${Math.random()}`,
  name: "",
  hex: "#808080",
  images: [],
});

const blank = (): FormState => ({
  id: "",
  name: "",
  category: "",
  price: "",
  descFr: "",
  descAr: "",
  variants: [{ ...makeVariant(), name: "Noir", hex: "#111111" }],
  sizes: "S, M, L, XL",
  active: true,
});

function fromProduct(p: Product): FormState {
  const colors = p.colors.length ? p.colors : [];
  const legacyImages = p.images || [];

  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: String(p.price),
    descFr: p.desc.fr,
    descAr: p.desc.ar,
    variants: colors.map((c, index) => ({
      key: `${p.id}-${index}`,
      name: c.name,
      hex: c.hex,
      // Anciennes données : associer les anciennes images à la première couleur.
      images: c.images?.length
        ? [...c.images]
        : index === 0
          ? [...legacyImages]
          : [],
    })),
    sizes: p.sizes.join(", "),
    active: p.active,
  };
}

async function readResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
  return data;
}

export default function AdminProducts({
  initialProducts,
}: {
  initialProducts: Product[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [form, setForm] = useState<FormState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function edit(product?: Product) {
    setMessage("");
    setForm(product ? fromProduct(product) : blank());
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  function updateVariant(key: string, changes: Partial<Variant>) {
    setForm((current) => current ? {
      ...current,
      variants: current.variants.map((v) =>
        v.key === key ? { ...v, ...changes } : v
      ),
    } : current);
  }

  async function uploadImages(key: string, files: FileList | null) {
    if (!files?.length) return;

    const selected = Array.from(files);
    for (const file of selected) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setMessage(`${file.name} : utilise JPG, PNG ou WebP.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setMessage(`${file.name} dépasse 5 Mo.`);
        return;
      }
    }

    setBusy(true);
    setMessage("Téléversement des photos…");

    try {
      const paths: string[] = [];

      for (const file of selected) {
        const data = new FormData();
        data.append("file", file);

        const response = await fetch("/api/admin/products/upload", {
          method: "POST",
          body: data,
          credentials: "same-origin",
        });

        const result = await readResponse(response);
        if (typeof result.path !== "string") {
          throw new Error("Le serveur n’a pas renvoyé le chemin de l’image.");
        }
        paths.push(result.path);
      }

      setForm((current) => current ? {
        ...current,
        variants: current.variants.map((v) =>
          v.key === key ? { ...v, images: [...v.images, ...paths] } : v
        ),
      } : current);

      setMessage(`${paths.length} photo(s) ajoutée(s) à cette couleur.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Échec du téléversement.");
    } finally {
      setBusy(false);
      const input = fileRefs.current[key];
      if (input) input.value = "";
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    const id = form.id.trim().toLowerCase();
    const variants: ProductColor[] = form.variants.map((v) => ({
      name: v.name.trim(),
      hex: v.hex,
      images: v.images,
    }));

    if (!/^[a-z0-9-]{2,80}$/.test(id)) {
      setMessage("Identifiant invalide : lettres minuscules, chiffres et tirets.");
      return;
    }

    if (!form.name.trim() || !form.category.trim() || !form.descFr.trim() || !form.descAr.trim()) {
      setMessage("Complète le nom, la catégorie et les deux descriptions.");
      return;
    }

    if (!Number.isSafeInteger(Number(form.price)) || Number(form.price) < 0) {
      setMessage("Le prix doit être un nombre entier positif ou nul.");
      return;
    }

    if (
      variants.length === 0 ||
      variants.some((v) =>
        !v.name ||
        !/^#[0-9a-f]{6}$/i.test(v.hex) ||
        v.images.length === 0
      )
    ) {
      setMessage("Chaque couleur doit avoir un nom, une couleur valide et au moins une photo.");
      return;
    }

    if (new Set(variants.map((v) => v.name.toLowerCase())).size !== variants.length) {
      setMessage("Chaque couleur doit avoir un nom unique.");
      return;
    }

    const sizes = form.sizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!sizes.length) {
      setMessage("Ajoute au moins une taille.");
      return;
    }

    const images = Array.from(new Set(variants.flatMap((v) => v.images)));
    const payload = {
      id,
      name: form.name.trim(),
      category: form.category.trim(),
      price: Number(form.price),
      descFr: form.descFr.trim(),
      descAr: form.descAr.trim(),
      images,
      colors: variants,
      sizes,
      active: form.active,
    };

    const editing = products.some((p) => p.id === id);

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        editing ? `/api/admin/products/${encodeURIComponent(id)}` : "/api/admin/products",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        }
      );

      await readResponse(response);

      const updated: Product = {
        id,
        name: payload.name,
        category: payload.category,
        price: payload.price,
        desc: { fr: payload.descFr, ar: payload.descAr },
        images,
        colors: variants,
        sizes,
        active: payload.active,
      };

      setProducts((current) =>
        editing
          ? current.map((p) => p.id === id ? updated : p)
          : [...current, updated]
      );
      setForm(null);
      setMessage("Produit enregistré.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erreur inconnue";
      const messages: Record<string, string> = {
        exists: "Cet identifiant existe déjà.",
        invalid: "Données invalides. Vérifie les champs et les photos de chaque couleur.",
        not_found: "Produit introuvable.",
      };
      setMessage(messages[reason] || `Enregistrement impossible : ${reason}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(product: Product) {
    const payload = {
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      descFr: product.desc.fr,
      descAr: product.desc.ar,
      images: product.images,
      colors: product.colors,
      sizes: product.sizes,
      active: !product.active,
    };

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      await readResponse(response);
      setProducts((current) => current.map((p) =>
        p.id === product.id ? { ...p, active: !p.active } : p
      ));
      setMessage("Statut mis à jour.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Supprimer « ${product.name} » ?`)) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      await readResponse(response);
      setProducts((current) => current.filter((p) => p.id !== product.id));
      setMessage("Produit supprimé.");
      if (form?.id === product.id) setForm(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    border: "1px solid #d6d3d1",
    borderRadius: 8,
    background: "#fff",
    color: "#171717",
    font: "inherit",
  };

  const buttonStyle = {
    padding: "9px 12px",
    border: "1px solid #d6d3d1",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
    color: "#171717",
  };

  return (
    <section style={{ color: "#171717" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 26 }}>Gestion des produits</h2>
          <p style={{ color: "#737373", margin: "6px 0 0" }}>{products.length} produit(s) au catalogue</p>
        </div>
        <button className="btn" type="button" disabled={busy} onClick={() => edit()}>
          + Ajouter un produit
        </button>
      </div>

      {message && <p role="status" style={{ padding: 12, background: "#f5f5f5", borderRadius: 8 }}>{message}</p>}

      {form && (
        <form onSubmit={save} style={{ display: "grid", gap: 14, maxWidth: 820, margin: "20px 0 32px", padding: 20, background: "#fafafa", border: "1px solid #e7e5e4", borderRadius: 12 }}>
          <h3 style={{ margin: 0 }}>{products.some((p) => p.id === form.id) ? "Modifier le produit" : "Nouveau produit"}</h3>

          <label style={{ display: "grid", gap: 6 }}>
            Identifiant unique
            <input required disabled={products.some((p) => p.id === form.id)} style={inputStyle} placeholder="hoodie-noir" value={form.id} onChange={(e) => update("id", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>Nom
              <input required style={inputStyle} value={form.name} onChange={(e) => update("name", e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>Catégorie
              <input required style={inputStyle} value={form.category} onChange={(e) => update("category", e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>Prix (DT)
              <input required type="number" min="0" step="1" style={inputStyle} value={form.price} onChange={(e) => update("price", e.target.value)} />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>Description française
            <textarea required rows={3} style={inputStyle} value={form.descFr} onChange={(e) => update("descFr", e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>Description arabe
            <textarea required rows={3} dir="rtl" style={inputStyle} value={form.descAr} onChange={(e) => update("descAr", e.target.value)} />
          </label>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <h3 style={{ margin: "0 0 4px" }}>Couleurs et photos</h3>
              <p style={{ margin: 0, color: "#737373", fontSize: 13 }}>
                Choisis la couleur avec le sélecteur, puis importe uniquement les photos de cette variante.
              </p>
            </div>

            {form.variants.map((variant, index) => (
              <div key={variant.key} style={{ display: "grid", gap: 10, padding: 14, background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(140px,1fr) 70px auto", alignItems: "end", gap: 10 }}>
                  <label style={{ display: "grid", gap: 5 }}>
                    Nom de la couleur
                    <input required style={inputStyle} placeholder="Gris chiné" value={variant.name} onChange={(e) => updateVariant(variant.key, { name: e.target.value })} />
                  </label>
                  <label style={{ display: "grid", gap: 5 }}>
                    Couleur
                    <input aria-label={`Choisir la couleur ${index + 1}`} type="color" value={variant.hex} onChange={(e) => updateVariant(variant.key, { hex: e.target.value })} style={{ width: "100%", height: 42, padding: 3, border: "1px solid #d6d3d1", borderRadius: 8, background: "#fff" }} />
                  </label>
                  <button type="button" disabled={busy || form.variants.length === 1} style={{ ...buttonStyle, color: "#b91c1c" }} onClick={() => update("variants", form.variants.filter((v) => v.key !== variant.key))}>
                    Retirer
                  </button>
                </div>

                <label style={{ display: "grid", gap: 6 }}>
                  Photos de {variant.name || `la couleur ${index + 1}`}
                  <input
                    ref={(node) => { fileRefs.current[variant.key] = node; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={busy}
                    onChange={(e) => uploadImages(variant.key, e.target.files)}
                  />
                  <span style={{ fontSize: 12, color: "#737373" }}>JPG, PNG ou WebP, maximum 5 Mo par photo.</span>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
                  {variant.images.map((src, imageIndex) => (
                    <div key={`${src}-${imageIndex}`} style={{ border: "1px solid #e7e5e4", padding: 7, borderRadius: 8, minWidth: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`${variant.name} ${imageIndex + 1}`} style={{ width: "100%", height: 105, objectFit: "contain", background: "#fafafa" }} />
                      <button type="button" style={{ ...buttonStyle, width: "100%", marginTop: 6, fontSize: 12 }} onClick={() => updateVariant(variant.key, { images: variant.images.filter((_, i) => i !== imageIndex) })}>
                        Retirer la photo
                      </button>
                    </div>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: variant.images.length ? "#166534" : "#b91c1c" }}>
                  {variant.images.length} photo(s) associée(s)
                </p>
              </div>
            ))}

            <button type="button" disabled={busy} style={{ ...buttonStyle, justifySelf: "start" }} onClick={() => update("variants", [...form.variants, makeVariant()])}>
              + Ajouter une couleur
            </button>
          </div>

          <label style={{ display: "grid", gap: 6 }}>Tailles (séparées par des virgules)
            <input required style={inputStyle} value={form.sizes} onChange={(e) => update("sizes", e.target.value)} placeholder="S, M, L, XL" />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} />
            Produit visible dans le catalogue
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le produit"}</button>
            <button type="button" style={buttonStyle} disabled={busy} onClick={() => setForm(null)}>Annuler</button>
          </div>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 16 }}>
        {products.map((p) => (
          <article key={p.id} style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, background: "#fff", minWidth: 0 }}>
            {p.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.images[0]} alt={p.name} style={{ width: "100%", height: 190, objectFit: "contain", background: "#fafafa", borderRadius: 8 }} />
            )}
            <h3 style={{ margin: "12px 0 4px" }}>{p.name}</h3>
            <p style={{ margin: "0 0 6px", color: "#737373", fontSize: 12 }}>{p.id}</p>
            <p><strong>{p.price} DT</strong> · {p.category}</p>
            <p style={{ fontSize: 13 }}>{p.active ? "● Actif" : "○ Masqué"} · {p.colors.length} couleur(s)</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" style={buttonStyle} disabled={busy} onClick={() => edit(p)}>Modifier</button>
              <button type="button" style={buttonStyle} disabled={busy} onClick={() => toggle(p)}>{p.active ? "Masquer" : "Activer"}</button>
              <button type="button" style={{ ...buttonStyle, color: "#b91c1c" }} disabled={busy} onClick={() => remove(p)}>Supprimer</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
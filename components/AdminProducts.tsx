"use client";

import { FormEvent, useRef, useState } from "react";
import type { Product } from "@/lib/data";

type FormState = {
  id: string;
  name: string;
  category: string;
  price: string;
  descFr: string;
  descAr: string;
  images: string[];
  colors: string;
  sizes: string;
  active: boolean;
};

const blank = (): FormState => ({
  id: "",
  name: "",
  category: "",
  price: "",
  descFr: "",
  descAr: "",
  images: [],
  colors: "Noir|#111111",
  sizes: "S, M, L, XL",
  active: true,
});

function fromProduct(p: Product): FormState {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: String(p.price),
    descFr: p.desc.fr,
    descAr: p.desc.ar,
    images: [...p.images],
    colors: p.colors.map((c) => `${c.name}|${c.hex}`).join("\n"),
    sizes: p.sizes.join(", "),
    active: p.active,
  };
}

function toPayload(form: FormState) {
  return {
    id: form.id.trim().toLowerCase(),
    name: form.name.trim(),
    category: form.category.trim(),
    price: Number(form.price),
    descFr: form.descFr.trim(),
    descAr: form.descAr.trim(),
    images: form.images,
    colors: form.colors
      .split("\n")
      .map((line) => {
        const [name, hex] = line.split("|");
        return { name: name?.trim() ?? "", hex: hex?.trim() ?? "" };
      })
      .filter((color) => color.name && /^#[0-9a-f]{6}$/i.test(color.hex)),
    sizes: form.sizes.split(",").map((s) => s.trim()).filter(Boolean),
    active: form.active,
  };
}

async function readResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Erreur HTTP ${response.status}`);
  }
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
  const fileInput = useRef<HTMLInputElement>(null);

  function edit(product?: Product) {
    setMessage("");
    setForm(product ? fromProduct(product) : blank());
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length || !form) return;

    const selected = Array.from(files);
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    for (const file of selected) {
      if (!allowed.includes(file.type)) {
        setMessage(`${file.name} : format accepté : JPG, PNG ou WebP.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setMessage(`${file.name} dépasse la limite de 5 Mo.`);
        return;
      }
    }

    setBusy(true);
    setMessage("Téléversement des images…");

    try {
      const uploaded: string[] = [];

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
          throw new Error("Chemin de l’image absent de la réponse.");
        }
        uploaded.push(result.path);
      }

      setForm((current) =>
        current ? { ...current, images: [...current.images, ...uploaded] } : current
      );
      setMessage(`${uploaded.length} image(s) ajoutée(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Échec du téléversement.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    const payload = toPayload(form);
    const editing = products.some((p) => p.id === form.id);

    if (!/^[a-z0-9-]{2,80}$/.test(payload.id)) {
      setMessage("Identifiant invalide : utilisez des lettres minuscules, chiffres et tirets.");
      return;
    }
    if (!payload.name || !payload.category || !payload.descFr || !payload.descAr) {
      setMessage("Complétez le nom, la catégorie et les deux descriptions.");
      return;
    }
    if (!Number.isInteger(payload.price) || payload.price < 0) {
      setMessage("Le prix doit être un nombre entier positif ou nul.");
      return;
    }
    if (!payload.images.length || !payload.colors.length || !payload.sizes.length) {
      setMessage("Ajoutez au moins une image, une couleur valide et une taille.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        editing ? `/api/admin/products/${encodeURIComponent(payload.id)}` : "/api/admin/products",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        }
      );

      await readResponse(response);

      const updated: Product = {
        id: payload.id,
        name: payload.name,
        category: payload.category,
        price: payload.price,
        desc: { fr: payload.descFr, ar: payload.descAr },
        images: payload.images,
        colors: payload.colors,
        sizes: payload.sizes,
        active: payload.active,
      };

      setProducts((current) =>
        editing
          ? current.map((p) => p.id === updated.id ? updated : p)
          : [...current, updated]
      );
      setForm(null);
      setMessage("Produit enregistré avec succès.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erreur inconnue";
      const messages: Record<string, string> = {
        exists: "Cet identifiant existe déjà.",
        invalid: "Certains champs sont invalides. Vérifiez le prix, les images, les couleurs et les tailles.",
        not_found: "Produit introuvable.",
        unauthorized: "Accès refusé. Reconnectez-vous à l’administration.",
      };
      setMessage(messages[reason] || `Enregistrement impossible : ${reason}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(product: Product) {
    setBusy(true);
    setMessage("");

    try {
      const payload = toPayload(fromProduct({ ...product, active: !product.active }));
      const response = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      await readResponse(response);

      setProducts((current) =>
        current.map((p) => p.id === product.id ? { ...p, active: !p.active } : p)
      );
      setMessage("Statut du produit mis à jour.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Supprimer définitivement « ${product.name} » ?`)) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(product.id)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
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

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "11px 12px",
    border: "1px solid #d4d4d4",
    borderRadius: 8,
    font: "inherit",
    background: "#fff",
    color: "#171717",
  };

  const buttonStyle = {
    padding: "9px 13px",
    border: "1px solid #d4d4d4",
    borderRadius: 8,
    background: "#fff",
    color: "#171717",
    cursor: "pointer",
  };

  return (
    <section style={{ color: "#171717" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        marginBottom: 20,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 26 }}>Gestion des produits</h2>
          <p style={{ margin: "6px 0 0", color: "#737373" }}>
            {products.length} produit(s) au catalogue
          </p>
        </div>
        <button className="btn" type="button" onClick={() => edit()} disabled={busy}>
          + Ajouter un produit
        </button>
      </div>

      {message && (
        <p role="status" style={{
          padding: 12,
          background: "#f5f5f5",
          borderRadius: 8,
          overflowWrap: "anywhere",
        }}>
          {message}
        </p>
      )}

      {form && (
        <form
          onSubmit={save}
          style={{
            display: "grid",
            gap: 14,
            padding: 20,
            margin: "20px 0 30px",
            maxWidth: 820,
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <h3 style={{ margin: 0 }}>{products.some((p) => p.id === form.id) ? "Modifier le produit" : "Nouveau produit"}</h3>

          <label style={{ display: "grid", gap: 6 }}>
            Identifiant unique
            <input
              required
              disabled={products.some((p) => p.id === form.id)}
              style={fieldStyle}
              placeholder="ex: hoodie-noir"
              value={form.id}
              onChange={(e) => update("id", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              Nom du produit
              <input required style={fieldStyle} value={form.name} onChange={(e) => update("name", e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Catégorie
              <input required style={fieldStyle} placeholder="Hoodies, Baggy…" value={form.category} onChange={(e) => update("category", e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Prix (DT)
              <input required type="number" min="0" step="1" style={fieldStyle} value={form.price} onChange={(e) => update("price", e.target.value)} />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            Description française
            <textarea required rows={3} style={fieldStyle} value={form.descFr} onChange={(e) => update("descFr", e.target.value)} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Description arabe
            <textarea required rows={3} dir="rtl" style={fieldStyle} value={form.descAr} onChange={(e) => update("descAr", e.target.value)} />
          </label>

          <div style={{ display: "grid", gap: 8 }}>
            <strong>Images du produit</strong>
            <p style={{ margin: 0, color: "#737373", fontSize: 13 }}>
              JPG, PNG ou WebP — maximum 5 Mo par image. Tu peux sélectionner plusieurs images.
            </p>

            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy}
              onChange={(e) => uploadImages(e.target.files)}
            />

            <input
              style={fieldStyle}
              placeholder="Ou ajouter un chemin d’image, ex: /products/hoodie.jpg"
              id="manual-image-path"
            />
            <button
              type="button"
              style={{ ...buttonStyle, justifySelf: "start" }}
              onClick={() => {
                const input = document.getElementById("manual-image-path") as HTMLInputElement | null;
                const path = input?.value.trim();
                if (!path) return;
                if (!path.startsWith("/") && !/^https?:\/\//i.test(path)) {
                  setMessage("Le chemin doit commencer par / ou être une URL http(s).");
                  return;
                }
                update("images", [...form.images, path]);
                if (input) input.value = "";
              }}
            >
              Ajouter ce chemin
            </button>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(125px,1fr))", gap: 10 }}>
              {form.images.map((src, index) => (
                <div key={`${src}-${index}`} style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  padding: 7,
                  background: "#fff",
                  minWidth: 0,
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Image produit ${index + 1}`}
                    style={{ width: "100%", height: 120, objectFit: "contain", display: "block" }}
                  />
                  <p style={{ fontSize: 11, overflowWrap: "anywhere", color: "#737373" }}>{src}</p>
                  <button
                    type="button"
                    style={{ ...buttonStyle, width: "100%" }}
                    onClick={() => update("images", form.images.filter((_, i) => i !== index))}
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            Couleurs — une par ligne, format `Nom|#HEX`
            <textarea
              required
              rows={3}
              style={fieldStyle}
              placeholder={"Noir|#111111\nGris|#888888"}
              value={form.colors}
              onChange={(e) => update("colors", e.target.value)}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Tailles — séparées par des virgules
            <input required style={fieldStyle} placeholder="S, M, L, XL" value={form.sizes} onChange={(e) => update("sizes", e.target.value)} />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} />
            Produit visible dans le catalogue
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Patiente…" : "Enregistrer le produit"}
            </button>
            <button type="button" style={buttonStyle} disabled={busy} onClick={() => setForm(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))",
        gap: 16,
      }}>
        {products.map((p) => (
          <article key={p.id} style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
            minWidth: 0,
          }}>
            {p.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.images[0]}
                alt={p.name}
                style={{ width: "100%", height: 190, objectFit: "contain", background: "#fafafa", borderRadius: 8 }}
              />
            )}
            <h3 style={{ margin: "12px 0 4px" }}>{p.name}</h3>
            <p style={{ margin: "0 0 6px", color: "#737373", fontSize: 12, overflowWrap: "anywhere" }}>{p.id}</p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>{p.price} DT</strong> · {p.category}
            </p>
            <p style={{ margin: "0 0 12px", fontSize: 13 }}>
              {p.active ? "● Actif" : "○ Masqué"} · {p.images.length} image(s)
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" style={buttonStyle} disabled={busy} onClick={() => edit(p)}>Modifier</button>
              <button type="button" style={buttonStyle} disabled={busy} onClick={() => toggle(p)}>
                {p.active ? "Masquer" : "Activer"}
              </button>
              <button type="button" style={{ ...buttonStyle, color: "#b91c1c" }} disabled={busy} onClick={() => remove(p)}>
                Supprimer
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
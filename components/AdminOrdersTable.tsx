"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/data";
import { WILAYAS, MAX_QTY } from "@/lib/data";
import {
  normalizeTunisiaPhone,
  type OrderStatus,
} from "@/lib/duplicate-orders.mjs";
import { formatTunisiaDateTime } from "@/lib/tunisia-time.mjs";
import { formatOrderDesignation } from "@/lib/order-designation.mjs";

type OrderItem = {
  product_id: string;
  product_name: string;
  color: string;
  size: string;
  qty: number;
};

type Order = {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  phone2: string;
  governorate: string;
  city: string;
  address: string;
  designation: string;
  item_price: number;
  total: number;
  exported_at: string | null;
  export_batch_id: number | null;
  duplicate_status: OrderStatus;
  duplicate_of: number | null;
  items: OrderItem[];
};

type EditItem = {
  productId: string;
  color: string;
  size: string;
  qty: number;
};

type EditDraft = {
  name: string;
  address: string;
  city: string;
  governorate: string;
  phone: string;
  phone2: string;
  items: EditItem[];
};

type Action = { orderId: number; kind: "supersede" | "restore" | "edit" } | null;

const PAGE_SIZE = 10;

const reviewLabel: Record<OrderStatus, string> = {
  normal: "Normale",
  pending_review: "À vérifier",
  confirmed_new: "Nouvelle confirmée",
  confirmed_duplicate: "Doublon confirmé",
};

const isExported = (order: Order) =>
  order.exported_at !== null || order.export_batch_id !== null;

const phoneMatches = (left: Order, right: Order) => {
  const leftPhones = [left.phone, left.phone2]
    .map(normalizeTunisiaPhone)
    .filter((phone): phone is string => phone !== null);
  const rightPhones = [right.phone, right.phone2]
    .map(normalizeTunisiaPhone)
    .filter((phone): phone is string => phone !== null);
  return leftPhones.some((phone) => rightPhones.includes(phone));
};

function orderItems(order: Pick<Order, "items" | "designation">) {
  return order.items.length
    ? <li>{formatOrderDesignation(order.items)}</li>
    : <li>{order.designation || "Aucun article détaillé"}</li>;
}

export default function AdminOrdersTable({
  orders,
  products,
}: {
  orders: Order[];
  products: Product[];
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action>(null);
  const [keepOrderId, setKeepOrderId] = useState("");
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const visibleOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return orders.slice(start, start + PAGE_SIZE);
  }, [orders, currentPage]);

  const cell: React.CSSProperties = {
    padding: "10px 8px",
    textAlign: "left",
    verticalAlign: "top",
    borderBottom: "1px solid #e7e5e4",
    fontSize: 12,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  };

  const header: React.CSSProperties = {
    ...cell,
    background: "#f5f5f4",
    color: "#57534e",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    whiteSpace: "normal",
    overflowWrap: "break-word",
  };

  const actionButton: React.CSSProperties = {
    width: "100%",
    minHeight: 48,
    marginBottom: 7,
    padding: "10px",
    border: "1px solid #d6d3d1",
    borderRadius: 9,
    background: "#fff",
    color: "#292524",
    cursor: "pointer",
    fontWeight: 700,
    lineHeight: 1.3,
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 44,
    padding: "10px 12px",
    border: "1px solid #d6d3d1",
    borderRadius: 8,
    fontSize: 16,
    background: "#fff",
  };

  function closeAction() {
    setAction(null);
    setKeepOrderId("");
    setPreviewOrder(null);
    setDraft(null);
    setError("");
  }

  function openSupersede(order: Order) {
    const suggestions = orders.filter(
      (candidate) =>
        candidate.id !== order.id &&
        (candidate.duplicate_status === "normal" ||
          candidate.duplicate_status === "confirmed_new") &&
        phoneMatches(order, candidate)
    );
    setAction({ orderId: order.id, kind: "supersede" });
    setKeepOrderId(suggestions.length ? String(suggestions[0].id) : "");
    setPreviewOrder(suggestions[0] ?? null);
    setDraft(null);
    setError("");
    setSuccess("");
  }

  function openEdit(order: Order) {
    setAction({ orderId: order.id, kind: "edit" });
    setDraft({
      name: order.name,
      address: order.address,
      city: order.city,
      governorate: order.governorate,
      phone: order.phone,
      phone2: order.phone2,
      items: order.items.map((item) => ({
        productId: item.product_id,
        color: item.color,
        size: item.size,
        qty: item.qty,
      })),
    });
    setKeepOrderId("");
    setPreviewOrder(null);
    setError("");
    setSuccess("");
  }

  function keepOrderProblem(
    candidate: { id: number; duplicate_status: string },
    orderId: number
  ) {
    if (candidate.id === orderId) return "Choisissez une autre commande que celle-ci.";
    if (
      candidate.duplicate_status !== "normal" &&
      candidate.duplicate_status !== "confirmed_new"
    ) {
      return "Cette commande ne peut pas être gardée : elle est en revue ou déjà marquée comme doublon. Traitez-la d'abord.";
    }
    return "";
  }

  async function lookupKeepOrder() {
    const id = Number(keepOrderId);
    const currentId = action?.orderId ?? 0;
    if (!Number.isSafeInteger(id) || id < 1) {
      setError("Saisissez un numéro de commande valide.");
      return;
    }

    const localOrder = orders.find((order) => order.id === id);
    if (localOrder) {
      const problem = keepOrderProblem(localOrder, currentId);
      setPreviewOrder(problem ? null : localOrder);
      setError(problem);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/orders/supersede?orderId=${encodeURIComponent(id)}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Cette commande n’existe pas."
            : "Impossible de charger cette commande."
        );
      }
      const found = result as Order;
      const problem = keepOrderProblem(found, currentId);
      if (problem) throw new Error(problem);
      setPreviewOrder(found);
    } catch (cause) {
      setPreviewOrder(null);
      setError(cause instanceof Error ? cause.message : "Recherche impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function postSupersede(order: Order, restore = false) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/orders/supersede", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          restore
            ? { orderId: order.id, action: "restore" }
            : { orderId: order.id, keepOrderId: previewOrder?.id }
        ),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Une des commandes n’existe plus."
            : response.status === 409
              ? "La commande a changé ou n’est plus modifiable."
              : "Le changement n’a pas été enregistré."
        );
      }
      setSuccess(
        restore
          ? `Le doublon de la commande #${order.id} a été annulé.`
          : `La commande #${order.id} est marquée comme doublon de #${previewOrder?.id}.`
      );
      closeAction();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(order: Order) {
    if (!draft) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          items: draft.items.map(({ productId, color, size, qty }) => ({
            productId,
            color,
            size,
            qty,
          })),
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          response.status === 409
            ? "Cette commande n’est plus modifiable."
            : result?.error === "unavailable"
              ? "Un article n’est plus disponible dans le catalogue."
              : "Vérifiez les coordonnées, les couleurs, les tailles et les quantités."
        );
      }
      const saved = await response.json().catch(() => null);
      const newTotal = typeof saved?.total === "number" ? saved.total : null;
      setSuccess(
        newTotal === null
              ? `La commande #${order.id} a été modifiée.`
              : `La commande #${order.id} a été modifiée. Total : ${order.total} DT → ${newTotal} DT${newTotal !== order.total ? " (le prix a changé : préviens la cliente)" : ""}.`
      );
      closeAction();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }

  function updateDraftField(field: keyof Omit<EditDraft, "items">, value: string) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function updateItem(index: number, patch: Partial<EditItem>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item
        ),
      };
    });
  }

  const startEditItem = (): EditItem | null => {
    const product = products[0];
    if (!product) return null;
    return {
      productId: product.id,
      color: product.colors[0]?.name ?? "",
      size: product.sizes[0] ?? "",
      qty: 1,
    };
  };

  return (
    <>
      {success && (
        <p role="status" style={{ color: "#166534", fontWeight: 700 }}>
          {success}
        </p>
      )}
      <div
        style={{
          width: "100%",
          maxWidth: "100%",
          overflowX: "auto",
          background: "#fff",
          border: "1px solid #e7e5e4",
          borderRadius: 12,
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 1050,
            tableLayout: "fixed",
            borderCollapse: "collapse",
            borderSpacing: 0,
          }}
        >
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead>
            <tr>
              {[
                "N°",
                "Date",
                "Client",
                "Téléphone",
                "Gouvernorat / Ville",
                "Adresse",
                "Articles / Désignation",
                "Prix articles",
                "Total",
                "Revue",
                "Export",
                "Actions",
              ].map((title) => (
                <th key={title} style={header}>{title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map((order) => {
              const isActive = action?.orderId === order.id;
              const actionEligible =
                order.duplicate_status === "normal" ||
                order.duplicate_status === "confirmed_new";
              const canEdit =
                actionEligible || order.duplicate_status === "pending_review";
              const exported = isExported(order);
              const suggestions = orders.filter(
                (candidate) =>
                  candidate.id !== order.id &&
                  (candidate.duplicate_status === "normal" ||
                    candidate.duplicate_status === "confirmed_new") &&
                  phoneMatches(order, candidate)
              );

              return (
                <FragmentRows key={order.id}>
                  <tr>
                    <td style={cell}>#{order.id}</td>
                    <td style={{ ...cell, fontSize: 11 }}>
                      {formatTunisiaDateTime(order.created_at)}
                    </td>
                    <td style={{ ...cell, fontWeight: 600 }}>{order.name}</td>
                    <td style={{ ...cell, fontSize: 11 }}>
                      {order.phone}
                      {order.phone2 && order.phone2 !== order.phone && (
                        <div style={{ color: "#78716c" }}>{order.phone2}</div>
                      )}
                    </td>
                    <td style={cell}>
                      <div>{order.governorate}</div>
                      <div style={{ color: "#78716c", marginTop: 3 }}>{order.city}</div>
                    </td>
                    <td style={cell}>{order.address}</td>
                    <td style={cell}>
                      <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.6 }}>
                        {formatOrderDesignation(order.items) || order.designation || "—"}
                      </div>
                    </td>
                    <td style={{ ...cell, fontSize: 11 }}>{order.item_price} DT</td>
                    <td style={{ ...cell, fontWeight: 800, fontSize: 12 }}>
                      {order.total} DT
                    </td>
                    <td style={cell}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 6px",
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          lineHeight: 1.4,
                          background:
                            order.duplicate_status === "pending_review"
                              ? "#fef3c7"
                              : order.duplicate_status === "confirmed_duplicate"
                                ? "#fee2e2"
                                : "#f5f5f4",
                          color:
                            order.duplicate_status === "pending_review"
                              ? "#92400e"
                              : order.duplicate_status === "confirmed_duplicate"
                                ? "#991b1b"
                                : "#44403c",
                        }}
                      >
                        {reviewLabel[order.duplicate_status]}
                      </span>
                      {order.duplicate_of !== null && (
                        <div style={{ marginTop: 5, fontSize: 10, color: "#78716c" }}>
                          #{order.duplicate_of}
                        </div>
                      )}
                    </td>
                    <td style={cell}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 6px",
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          background: exported ? "#dcfce7" : "#fef3c7",
                          color: exported ? "#166534" : "#92400e",
                        }}
                      >
                        {exported ? "Exportée ✓" : "En attente"}
                      </span>
                    </td>
                    <td style={cell}>
                      {actionEligible && !exported && (
                        <button
                          type="button"
                          style={actionButton}
                          disabled={busy}
                          onClick={() => openSupersede(order)}
                        >
                          Doublon d&apos;une autre commande
                        </button>
                      )}
                      {order.duplicate_status === "confirmed_duplicate" && !exported && (
                        <button
                          type="button"
                          style={actionButton}
                          disabled={busy}
                          onClick={() => {
                            setAction({ orderId: order.id, kind: "restore" });
                            setError("");
                            setSuccess("");
                          }}
                        >
                          Annuler le doublon
                        </button>
                      )}
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            style={{
                              ...actionButton,
                              ...(exported
                                ? { color: "#78716c", cursor: "not-allowed" }
                                : {}),
                            }}
                            disabled={busy || exported}
                            onClick={() => openEdit(order)}
                          >
                            Modifier
                          </button>
                          {exported && (
                            <p style={{ margin: "0 0 8px", color: "#92400e", fontSize: 11 }}>
                              Déjà exportée : modifie le colis dans Navex
                            </p>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                  {isActive && (
                    <tr>
                      <td colSpan={12} style={{ ...cell, padding: 14, background: "#fafaf9" }}>
                        <div style={{ position: "sticky", left: 0, width: "min(100%, calc(100vw - 56px))", boxSizing: "border-box" }}>
                        {action.kind === "supersede" && (
                          <div style={{ display: "grid", gap: 12 }}>
                            <h3 style={{ margin: 0 }}>Marquer la commande #{order.id} comme doublon</h3>
                            <label style={{ display: "grid", gap: 6 }}>
                              Commandes au même téléphone normalisé
                              <select
                                style={fieldStyle}
                                value={suggestions.some((candidate) => String(candidate.id) === keepOrderId) ? keepOrderId : ""}
                                disabled={busy || suggestions.length === 0}
                                onChange={(event) => {
                                  const id = event.target.value;
                                  setKeepOrderId(id);
                                  setPreviewOrder(suggestions.find((candidate) => String(candidate.id) === id) ?? null);
                                  setError("");
                                }}
                              >
                                <option value="">Choisir une commande…</option>
                                {suggestions.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    #{candidate.id} — {candidate.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              <input
                                type="number"
                                min={1}
                                inputMode="numeric"
                                aria-label="Numéro de la commande à conserver"
                                placeholder="Numéro de commande à conserver"
                                style={{ ...fieldStyle, flex: "1 1 220px" }}
                                value={keepOrderId}
                                onChange={(event) => {
                                  setKeepOrderId(event.target.value);
                                  setPreviewOrder(null);
                                  setError("");
                                }}
                              />
                              <button type="button" style={actionButton} disabled={busy} onClick={lookupKeepOrder}>
                                Vérifier cette commande
                              </button>
                            </div>
                            {previewOrder && String(previewOrder.id) === keepOrderId && (
                              <>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                                    gap: 12,
                                  }}
                                >
                                  {[order, previewOrder].map((detail) => (
                                    <section
                                      key={detail.id}
                                      style={{ padding: 12, border: "1px solid #d6d3d1", borderRadius: 9, background: "#fff" }}
                                    >
                                      <strong>Commande #{detail.id} — {detail.name}</strong>
                                      <p style={{ margin: "6px 0" }}>
                                        Téléphone : {detail.phone}{detail.phone2 && detail.phone2 !== detail.phone ? ` / ${detail.phone2}` : ""}
                                      </p>
                                      <ul style={{ margin: 0, paddingLeft: 20 }}>{orderItems(detail)}</ul>
                                    </section>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  style={{ ...actionButton, maxWidth: 360, background: "#991b1b", color: "#fff" }}
                                  disabled={busy}
                                  onClick={() => postSupersede(order)}
                                >
                                  Confirmer le doublon
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {action.kind === "restore" && (
                          <div style={{ display: "grid", gap: 10 }}>
                            <p style={{ margin: 0 }}>
                              Annuler le doublon de la commande #{order.id} et la rendre de nouveau éligible à l’export ?
                            </p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              <button
                                type="button"
                                style={{ ...actionButton, maxWidth: 280, background: "#166534", color: "#fff" }}
                                disabled={busy}
                                onClick={() => postSupersede(order, true)}
                              >
                                Confirmer l’annulation
                              </button>
                              <button type="button" style={actionButton} disabled={busy} onClick={closeAction}>
                                Garder le doublon
                              </button>
                            </div>
                          </div>
                        )}
                        {action.kind === "edit" && draft && (
                          <div style={{ display: "grid", gap: 14 }}>
                            <h3 style={{ margin: 0 }}>Modifier la commande #{order.id}</h3>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
                              {([
                                ["name", "Nom"],
                                ["address", "Adresse"],
                                ["city", "Ville / délégation"],
                                ["phone", "Téléphone"],
                                ["phone2", "Téléphone secondaire"],
                              ] as const).map(([field, label]) => (
                                <label key={field} style={{ display: "grid", gap: 5 }}>
                                  {label}
                                  <input
                                    style={fieldStyle}
                                    value={draft[field]}
                                    onChange={(event) => updateDraftField(field, event.target.value)}
                                  />
                                </label>
                              ))}
                              <label style={{ display: "grid", gap: 5 }}>
                                Gouvernorat
                                <select
                                  style={fieldStyle}
                                  value={draft.governorate}
                                  onChange={(event) => updateDraftField("governorate", event.target.value)}
                                >
                                  {WILAYAS.map((wilaya) => (
                                    <option key={wilaya.v} value={wilaya.v}>{wilaya.v}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div style={{ display: "grid", gap: 10 }}>
                              <h4 style={{ margin: 0 }}>Articles</h4>
                              {draft.items.map((item, index) => {
                                const product = products.find((candidate) => candidate.id === item.productId);
                                const hasCurrentProduct = products.some((candidate) => candidate.id === item.productId);
                                return (
                                  <div
                                    key={`${index}-${item.productId}`}
                                    style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, padding: 10, border: "1px solid #e7e5e4", borderRadius: 9 }}
                                  >
                                    <label style={{ display: "grid", gap: 4 }}>
                                      Produit
                                      <select
                                        style={fieldStyle}
                                        value={item.productId}
                                        onChange={(event) => {
                                          const nextProduct = products.find((candidate) => candidate.id === event.target.value);
                                          updateItem(index, {
                                            productId: event.target.value,
                                            color: nextProduct?.colors[0]?.name ?? "",
                                            size: nextProduct?.sizes[0] ?? "",
                                          });
                                        }}
                                      >
                                        {!hasCurrentProduct && <option value={item.productId}>{order.items[index]?.product_name ?? item.productId} (indisponible)</option>}
                                        {products.map((candidate) => (
                                          <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label style={{ display: "grid", gap: 4 }}>
                                      Couleur
                                      <select style={fieldStyle} value={item.color} onChange={(event) => updateItem(index, { color: event.target.value })}>
                                        {(product?.colors ?? []).map((color) => (
                                          <option key={color.name} value={color.name}>{color.name}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label style={{ display: "grid", gap: 4 }}>
                                      Taille
                                      <select style={fieldStyle} value={item.size} onChange={(event) => updateItem(index, { size: event.target.value })}>
                                        {(product?.sizes ?? []).map((size) => (
                                          <option key={size} value={size}>{size}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label style={{ display: "grid", gap: 4 }}>
                                      Quantité
                                      <input
                                        type="number"
                                        min={1}
                                        max={MAX_QTY}
                                        inputMode="numeric"
                                        style={fieldStyle}
                                        value={item.qty}
                                        onChange={(event) => updateItem(index, { qty: Number(event.target.value) })}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      style={{ ...actionButton, alignSelf: "end", color: "#991b1b" }}
                                      onClick={() => setDraft((current) => current ? { ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) } : current)}
                                    >
                                      Retirer l’article
                                    </button>
                                  </div>
                                );
                              })}
                              <button
                                type="button"
                                style={{ ...actionButton, maxWidth: 260 }}
                                disabled={!products.length}
                                onClick={() => {
                                  const item = startEditItem();
                                  if (item) setDraft((current) => current ? { ...current, items: [...current.items, item] } : current);
                                }}
                              >
                                Ajouter un article
                              </button>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              <button
                                type="button"
                                style={{ ...actionButton, maxWidth: 260, background: "#166534", color: "#fff" }}
                                disabled={busy}
                                onClick={() => saveEdit(order)}
                              >
                                Enregistrer les modifications
                              </button>
                              <button type="button" style={actionButton} disabled={busy} onClick={closeAction}>
                                Annuler
                              </button>
                            </div>
                          </div>
                        )}
                        {error && <p role="alert" style={{ margin: "12px 0 0", color: "#b91c1c" }}>{error}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRows>
              );
            })}
            {visibleOrders.length === 0 && (
              <tr>
                <td colSpan={12} style={{ ...cell, textAlign: "center", padding: 30 }}>
                  Aucune commande.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 18 }}>
        <span style={{ color: "#78716c", fontSize: 13 }}>
          {orders.length === 0 ? "0 commande" : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, orders.length)} sur ${orders.length} commandes`}
        </span>
        <nav aria-label="Pagination des commandes" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={{ ...actionButton, width: 44, minHeight: 44, opacity: currentPage === 1 ? 0.45 : 1 }} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>←</button>
          {Array.from({ length: totalPages }, (_, index) => index + 1)
            .filter((number) => number === 1 || number === totalPages || Math.abs(number - currentPage) <= 2)
            .map((number, index, pages) => (
              <span key={number} style={{ display: "contents" }}>
                {index > 0 && number - pages[index - 1] > 1 && <span style={{ padding: "8px 3px" }}>…</span>}
                <button
                  type="button"
                  aria-current={number === currentPage ? "page" : undefined}
                  style={{ ...actionButton, width: 44, minHeight: 44, background: number === currentPage ? "#111" : "#fff", color: number === currentPage ? "#fff" : "#292524" }}
                  onClick={() => setPage(number)}
                >
                  {number}
                </button>
              </span>
            ))}
          <button type="button" style={{ ...actionButton, width: 44, minHeight: 44, opacity: currentPage === totalPages ? 0.45 : 1 }} disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>→</button>
        </nav>
      </div>
    </>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

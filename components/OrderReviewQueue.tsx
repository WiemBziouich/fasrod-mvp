"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ComparedItem = {
  product_id: string;
  product_name: string;
  color: string;
  size: string;
  qty: number;
};

type Candidate = {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  phone2: string;
  items: ComparedItem[];
} | null;

type PendingOrder = {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  phone2: string;
  duplicate_of: number | null;
  items: ComparedItem[];
  candidate: Candidate;
  phoneMatch: boolean;
  cartMatch: boolean;
};

const actions = [
  { status: "confirmed_new", label: "Confirmer nouvelle commande" },
  { status: "pending_review", label: "Garder en attente" },
  { status: "confirmed_duplicate", label: "Confirmer doublon" },
] as const;

export default function OrderReviewQueue({
  orders,
}: {
  orders: PendingOrder[];
}) {
  const router = useRouter();
  const [busyOrder, setBusyOrder] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function decide(order: PendingOrder, status: (typeof actions)[number]["status"]) {
    if (busyOrder !== null) return;
    setBusyOrder(order.id);
    setError("");

    try {
      const response = await fetch("/api/admin/orders/review", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          status,
          duplicateOf:
            status === "confirmed_duplicate" ? order.duplicate_of : null,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error === "duplicate_reference_not_found"
            ? "La commande correspondante n’existe plus."
            : `La décision n’a pas été enregistrée (HTTP ${response.status}).`
        );
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Décision impossible.");
    } finally {
      setBusyOrder(null);
    }
  }

  const itemList = (items: ComparedItem[]) =>
    items.length ? (
      <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
        {items.map((item, index) => (
          <li key={`${item.product_id}-${item.color}-${item.size}-${index}`}>
            {item.product_name} — {item.color} — {item.size} × {item.qty}
          </li>
        ))}
      </ul>
    ) : (
      <p style={{ margin: "6px 0 0", color: "#78716c" }}>
        Aucun article trouvé pour cette commande.
      </p>
    );

  return (
    <section
      aria-labelledby="duplicate-review-heading"
      style={{
        marginBottom: 24,
        padding: 18,
        border: "1px solid #fed7aa",
        borderRadius: 12,
        background: "#fff7ed",
      }}
    >
      <h2 id="duplicate-review-heading" style={{ margin: "0 0 12px" }}>
        Commandes à vérifier ({orders.length})
      </h2>
      {orders.length === 0 ? (
        <p style={{ margin: 0, color: "#78716c" }}>
          Aucune commande en attente de revue.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {orders.map((order) => (
            <article
              key={order.id}
              style={{
                padding: 14,
                border: "1px solid #e7e5e4",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <h3 style={{ margin: "0 0 8px" }}>
                Commande #{order.id} — {order.name}
              </h3>
              <p style={{ margin: 0, color: "#57534e", fontSize: 13 }}>
                {order.created_at} · Téléphones {order.phone}
                {order.phone2 && order.phone2 !== order.phone
                  ? ` / ${order.phone2}`
                  : ""}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                Téléphone correspondant : {order.phoneMatch ? "oui" : "non"} ·
                Panier identique : {order.cartMatch ? "oui" : "non"}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
                  gap: 14,
                  marginTop: 12,
                  fontSize: 13,
                }}
              >
                <div>
                  <strong>Panier à vérifier</strong>
                  {itemList(order.items)}
                </div>
                <div>
                  <strong>
                    {order.candidate
                      ? `Commande correspondante #${order.candidate.id}`
                      : "Commande correspondante indisponible"}
                  </strong>
                  {order.candidate ? (
                    <>
                      <p style={{ margin: "6px 0 0", color: "#57534e" }}>
                        {order.candidate.created_at} · {order.candidate.name} ·{" "}
                        {order.candidate.phone}
                        {order.candidate.phone2 &&
                        order.candidate.phone2 !== order.candidate.phone
                          ? ` / ${order.candidate.phone2}`
                          : ""}
                      </p>
                      {itemList(order.candidate.items)}
                    </>
                  ) : (
                    <p style={{ margin: "6px 0 0", color: "#78716c" }}>
                      Vérifiez la référence avant de confirmer le doublon.
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                {actions.map((action) => (
                  <button
                    key={action.status}
                    type="button"
                    disabled={
                      busyOrder !== null ||
                      (action.status === "confirmed_duplicate" &&
                        (!order.duplicate_of || !order.candidate))
                    }
                    onClick={() => decide(order, action.status)}
                    style={{
                      padding: "9px 12px",
                      border: "1px solid #d6d3d1",
                      borderRadius: 8,
                      background:
                        action.status === "confirmed_duplicate"
                          ? "#b91c1c"
                          : action.status === "confirmed_new"
                            ? "#166534"
                            : "#fff",
                      color:
                        action.status === "pending_review" ? "#292524" : "#fff",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {busyOrder === order.id ? "Enregistrement…" : action.label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" style={{ margin: "12px 0 0", color: "#b91c1c" }}>
          {error}
        </p>
      )}
    </section>
  );
}

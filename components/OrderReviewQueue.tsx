"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatTunisiaDateTime } from "@/lib/tunisia-time.mjs";
import { formatOrderDesignation } from "@/lib/order-designation.mjs";

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
  review_reason: string;
  review_details: Record<string, string>;
  items: ComparedItem[];
  candidate: Candidate;
  phoneMatch: boolean;
  cartMatch: boolean;
};

function basketDifferences(order: PendingOrder) {
  if (!order.candidate) return [];
  const keyOf = (item: ComparedItem) =>
    JSON.stringify([item.product_id, item.color, item.size]);
  const candidateItems = new Map(
    order.candidate.items.map((item) => [keyOf(item), item])
  );
  const orderItems = new Map(order.items.map((item) => [keyOf(item), item]));
  const differences: string[] = [];

  for (const item of order.items) {
    const candidateItem = candidateItems.get(keyOf(item));
    if (!candidateItem) {
      differences.push(
        `Seulement dans #${order.id} : ${item.product_name} — ${item.color} — ${item.size} × ${item.qty}`
      );
    } else if (item.qty !== candidateItem.qty) {
      differences.push(
        `Quantité différente — ${item.product_name}, ${item.color}, ${item.size} : #${order.id} × ${item.qty}, #${order.candidate.id} × ${candidateItem.qty}`
      );
    }
  }
  for (const item of order.candidate.items) {
    if (!orderItems.has(keyOf(item))) {
      differences.push(
        `Seulement dans #${order.candidate.id} : ${item.product_name} — ${item.color} — ${item.size} × ${item.qty}`
      );
    }
  }
  return differences;
}

const actions = [
  { status: "confirmed_new", label: "Confirmer nouvelle commande" },
  { status: "pending_review", label: "Garder en attente" },
  { status: "rejected", label: "Refuser la commande" },
  { status: "confirmed_duplicate", label: "Confirmer doublon" },
] as const;
type ReviewAction = (typeof actions)[number]["status"];

const reviewReasonLabels: Record<string, string> = {
  same_basket: "Panier identique",
  recent_phone: "Commande récente avec ce numéro",
  open_parcel: "Colis Navex encore ouvert",
  previous_return: "Retour Navex récent",
  flagged_phone: "Numéro signalé à risque",
};

function getReviewReasons(order: PendingOrder) {
  return order.review_reason
    .split(",")
    .map((reason) => reason.trim())
    .filter(Boolean);
}

export default function OrderReviewQueue({
  orders,
}: {
  orders: PendingOrder[];
}) {
  const router = useRouter();
  const [busyOrder, setBusyOrder] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function decide(order: PendingOrder, status: ReviewAction) {
    if (busyOrder !== null) return;
    if (
      status === "rejected" &&
      !window.confirm(
        `Refuser la commande #${order.id} ? Elle ne sera pas exportée vers Navex.`
      )
    ) {
      return;
    }
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
        const messages: Record<string, string> = {
          invalid_duplicate_reference:
            "La commande de référence a déjà été traitée comme doublon, ou elle a changé. Traite d’abord la plus récente, puis recharge la page.",
          review_already_resolved:
            "Cette commande a déjà été traitée. Recharge la page.",
          duplicate_review_migration_required:
            "La migration des décisions de revue doit être appliquée avant de traiter cette commande.",
          order_not_found:
            "Cette commande n’existe plus. Recharge la page.",
        };
        throw new Error(
          messages[result?.error] ??
            `La décision n’a pas été enregistrée (HTTP ${response.status}).`
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
        <li>{formatOrderDesignation(items)}</li>
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
              <div
                role="note"
                style={{
                  margin: "-14px -14px 12px",
                  padding: "12px 14px",
                  color: "#fff",
                  background: "#b91c1c",
                  borderRadius: "10px 10px 0 0",
                  fontWeight: 700,
                }}
              >
                {getReviewReasons(order).length === 0 ? (
                  <div>
                    À vérifier · Commande #{order.id} · {order.created_at} ·{" "}
                    {order.phone}
                  </div>
                ) : (
                  getReviewReasons(order).map((reason) => (
                    <div key={reason}>
                      {reviewReasonLabels[reason] ?? "Risque client"} ·{" "}
                      {order.review_details[reason] ??
                        `Téléphone ${order.phone} · ${order.created_at}`}
                    </div>
                  ))
                )}
              </div>
              <h3 style={{ margin: "0 0 8px" }}>
                Commande #{order.id} — {order.name}
              </h3>
              <p style={{ margin: 0, color: "#57534e", fontSize: 13 }}>
                {formatTunisiaDateTime(order.created_at)} · Téléphones {order.phone}
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
                        {formatTunisiaDateTime(order.candidate.created_at)} · {order.candidate.name} ·{" "}
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
              {order.candidate && !order.cartMatch && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    border: "1px solid #fed7aa",
                    borderRadius: 8,
                    background: "#fff7ed",
                  }}
                >
                  <strong>Différences entre les paniers</strong>
                  {basketDifferences(order).length ? (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                      {basketDifferences(order).map((difference) => (
                        <li key={difference}>{difference}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: "6px 0 0" }}>
                      Le contenu des lignes diffère ou manque dans les données enregistrées.
                    </p>
                  )}
                </div>
              )}
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
                          : action.status === "rejected"
                            ? "#991b1b"
                            : action.status === "confirmed_new"
                            ? "#166534"
                            : "#fff",
                      color:
                        action.status === "pending_review" ? "#292524" : "#fff",
                      cursor: "pointer",
                      fontWeight: 600,
                      minHeight: 44,
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

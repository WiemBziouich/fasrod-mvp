
"use client";

import { useMemo, useState } from "react";
import type { OrderStatus } from "@/lib/duplicate-orders.mjs";

type Order = {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  governorate: string;
  city: string;
  address: string;
  designation: string;
  item_price: number;
  total: number;
  exported_at: string | null;
  duplicate_status: OrderStatus;
  duplicate_of: number | null;
};

const PAGE_SIZE = 10;

const reviewLabel: Record<OrderStatus, string> = {
  normal: "Normale",
  pending_review: "À vérifier",
  confirmed_new: "Nouvelle confirmée",
  confirmed_duplicate: "Doublon confirmé",
};

export default function AdminOrdersTable({ orders }: { orders: Order[] }) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const visibleOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return orders.slice(start, start + PAGE_SIZE);
  }, [orders, currentPage]);

  const cell: React.CSSProperties = {
    padding: "16px 18px",
    textAlign: "left",
    verticalAlign: "top",
    borderBottom: "1px solid #e7e5e4",
    fontSize: 13,
    lineHeight: 1.6,
  };

  const header: React.CSSProperties = {
    ...cell,
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: "#f5f5f4",
    color: "#57534e",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  const button = (active: boolean): React.CSSProperties => ({
    minWidth: 38,
    padding: "9px 12px",
    borderRadius: 8,
    border: active ? "1px solid #111" : "1px solid #d6d3d1",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#292524",
    cursor: "pointer",
    fontWeight: active ? 700 : 400,
  });

  return (
    <>
      <div
        style={{
          width: "100%",
          maxWidth: "100%",
          overflowX: "auto",
          overscrollBehaviorX: "contain",
          background: "#fff",
          border: "1px solid #e7e5e4",
          borderRadius: 12,
          WebkitOverflowScrolling: "touch",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 1550,
            tableLayout: "fixed",
            borderCollapse: "separate",
            borderSpacing: 0,
          }}
        >
          <colgroup>
            <col style={{ width: 65 }} />
            <col style={{ width: 155 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 125 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 210 }} />
            <col style={{ width: 360 }} />
            <col style={{ width: 115 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 165 }} />
            <col style={{ width: 125 }} />
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
              ].map((title) => (
                <th key={title} style={header}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleOrders.map((order) => (
              <tr key={order.id}>
                <td style={cell}>#{order.id}</td>

                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  {order.created_at}
                </td>

                <td style={{ ...cell, overflowWrap: "anywhere", fontWeight: 600 }}>
                  {order.name}
                </td>

                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  {order.phone}
                </td>

                <td style={cell}>
                  <div>{order.governorate}</div>
                  <div style={{ color: "#78716c", marginTop: 3 }}>
                    {order.city}
                  </div>
                </td>

                <td style={{ ...cell, overflowWrap: "anywhere" }}>
                  {order.address}
                </td>

                <td
                  style={{
                    ...cell,
                    whiteSpace: "normal",
                    overflowWrap: "break-word",
                    wordBreak: "normal",
                    minWidth: 360,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.75,
                      color: "#292524",
                      fontWeight: 500,
                    }}
                  >
                    {order.designation || "—"}
                  </div>
                </td>

                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  {order.item_price} DT
                </td>

                <td
                  style={{
                    ...cell,
                    whiteSpace: "nowrap",
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  {order.total} DT
                </td>

                <td style={cell}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "5px 9px",
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
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
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "#78716c",
                      }}
                    >
                      Commande #{order.duplicate_of}
                    </div>
                  )}
                </td>

                <td style={cell}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "6px 10px",
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      background: order.exported_at ? "#dcfce7" : "#fef3c7",
                      color: order.exported_at ? "#166534" : "#92400e",
                    }}
                  >
                    {order.exported_at ? "Exportée ✓" : "En attente"}
                  </span>
                </td>
              </tr>
            ))}

            {visibleOrders.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  style={{ ...cell, textAlign: "center", padding: 35 }}
                >
                  Aucune commande.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginTop: 18,
        }}
      >
        <span style={{ color: "#78716c", fontSize: 13 }}>
          {orders.length === 0
            ? "0 commande"
            : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(
                currentPage * PAGE_SIZE,
                orders.length
              )} sur ${orders.length} commandes`}
        </span>

        <nav
          aria-label="Pagination des commandes"
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
        >
          <button
            type="button"
            style={{
              ...button(false),
              opacity: currentPage === 1 ? 0.45 : 1,
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
            }}
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            ←
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (n) =>
                n === 1 ||
                n === totalPages ||
                Math.abs(n - currentPage) <= 2
            )
            .map((n, i, pages) => (
              <span key={n} style={{ display: "contents" }}>
                {i > 0 && n - pages[i - 1] > 1 && (
                  <span style={{ padding: "9px 3px" }}>…</span>
                )}
                <button
                  type="button"
                  aria-current={n === currentPage ? "page" : undefined}
                  style={button(n === currentPage)}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              </span>
            ))}

          <button
            type="button"
            style={{
              ...button(false),
              opacity: currentPage === totalPages ? 0.45 : 1,
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
            }}
            disabled={currentPage === totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            →
          </button>
        </nav>
      </div>
    </>
  );
}

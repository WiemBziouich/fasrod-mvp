"use client";

import { useMemo, useState } from "react";

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
};

const PAGE_SIZE = 10;

export default function AdminOrdersTable({ orders }: { orders: Order[] }) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const visibleOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return orders.slice(start, start + PAGE_SIZE);
  }, [orders, currentPage]);

  const cell: React.CSSProperties = {
    padding: "13px 14px",
    textAlign: "left",
    verticalAlign: "top",
    borderBottom: "1px solid #eee",
    fontSize: 13,
    lineHeight: 1.5,
  };

  const header: React.CSSProperties = {
    ...cell,
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
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12 }}>
        <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["N°", "Date", "Client", "Téléphone", "Gouvernorat / Ville", "Adresse", "Article", "Prix articles", "Total", "Export"].map((title) => (
                <th key={title} style={header}>{title}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleOrders.map((order) => (
              <tr key={order.id}>
                <td style={cell}>#{order.id}</td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{order.created_at}</td>
                <td style={cell}>{order.name}</td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{order.phone}</td>
                <td style={cell}>{order.governorate}<br />{order.city}</td>
                <td style={cell}>{order.address}</td>
                <td style={cell}>{order.designation}</td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{order.item_price} DT</td>
                <td style={{ ...cell, whiteSpace: "nowrap", fontWeight: 700 }}>{order.total} DT</td>
                <td style={cell}>
                  <span style={{
                    display: "inline-block",
                    padding: "5px 9px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    background: order.exported_at ? "#dcfce7" : "#fef3c7",
                    color: order.exported_at ? "#166534" : "#92400e",
                  }}>
                    {order.exported_at ? "Exportée ✓" : "En attente"}
                  </span>
                </td>
              </tr>
            ))}

            {visibleOrders.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...cell, textAlign: "center", padding: 35 }}>
                  Aucune commande.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 18,
      }}>
        <span style={{ color: "#78716c", fontSize: 13 }}>
          {orders.length === 0 ? "0 commande" : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, orders.length)} sur ${orders.length} commandes`}
        </span>

        <nav aria-label="Pagination des commandes" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            style={button(false)}
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            ←
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 2)
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
            style={button(false)}
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
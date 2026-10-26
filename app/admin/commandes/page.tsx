import db from "@/lib/db";
import AdminOrdersTable from "@/components/AdminOrdersTable";
import AdminNav from "@/components/AdminNav";
import OldExportedOrdersCleanup from "@/components/OldExportedOrdersCleanup";
import ExportCsvButton from "@/components/ExportCsvButton";
import OrderReviewQueue from "@/components/OrderReviewQueue";
import {
  EXPORTABLE_ORDER_STATUSES,
  normalizeTunisiaPhone,
  basketsMatch,
  type BasketItem,
  type OrderStatus,
} from "@/lib/duplicate-orders.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

type ComparedItem = BasketItem & {
  product_name: string;
};

type OrderSummary = {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  phone2: string;
  duplicate_of: number | null;
  items: ComparedItem[];
};

export default async function AdminOrdersPage() {
  const [result, reviewResult, exportCountResult, oldExportedResult] = await Promise.all([
    db.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 200"),
    db.execute(`
      SELECT id, created_at, name, phone, phone2, duplicate_of
      FROM orders
      WHERE duplicate_status = 'pending_review'
      ORDER BY created_at DESC, id DESC
    `),
    db.execute({
      sql: `
        SELECT COUNT(*) AS count
        FROM orders
        WHERE exported_at IS NULL
          AND duplicate_status IN (${EXPORTABLE_ORDER_STATUSES.map(() => "?").join(", ")})
      `,
      args: [...EXPORTABLE_ORDER_STATUSES],
    }),
    db.execute(`
      SELECT COUNT(*) AS count
      FROM orders AS candidate
      WHERE candidate.exported_at IS NOT NULL
        AND datetime(candidate.exported_at) <= datetime('now', '-30 days')
        AND candidate.duplicate_status = 'normal'
        AND candidate.duplicate_of IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM orders AS referencing_order
          WHERE referencing_order.duplicate_of = candidate.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM order_review_history AS history
          WHERE history.order_id = candidate.id
             OR history.previous_duplicate_of = candidate.id
             OR history.duplicate_of = candidate.id
        )
    `),
  ]);
  const mapOrder = (row: (typeof result.rows)[number]): Order => {
    const value = row as unknown as Record<string, unknown>;
    return {
      id: Number(value.id),
      created_at: String(value.created_at ?? ""),
      name: String(value.name ?? ""),
      phone: String(value.phone ?? ""),
      governorate: String(value.governorate ?? ""),
      city: String(value.city ?? ""),
      address: String(value.address ?? ""),
      designation: String(value.designation ?? ""),
      item_price: Number(value.item_price ?? 0),
      total: Number(value.total ?? 0),
      exported_at: value.exported_at == null ? null : String(value.exported_at),
      duplicate_status: String(value.duplicate_status) as OrderStatus,
      duplicate_of: value.duplicate_of == null ? null : Number(value.duplicate_of),
    };
  };
  const rows: Order[] = result.rows.map(mapOrder);
  const reviewOrders = reviewResult.rows.map((row) => {
    const value = row as unknown as Record<string, unknown>;
    return {
      id: Number(value.id),
      created_at: String(value.created_at ?? ""),
      name: String(value.name ?? ""),
      phone: String(value.phone ?? ""),
      phone2: String(value.phone2 ?? ""),
      duplicate_of: value.duplicate_of == null ? null : Number(value.duplicate_of),
    };
  });
  const comparedOrderIds = Array.from(
    new Set(
      reviewOrders.flatMap((order) =>
        order.duplicate_of === null
          ? [order.id]
          : [order.id, order.duplicate_of]
      )
    )
  );
  const comparedOrders = new Map<number, OrderSummary>();
  for (let offset = 0; offset < comparedOrderIds.length; offset += 500) {
    const batch = comparedOrderIds.slice(offset, offset + 500);
    const placeholders = batch.map(() => "?").join(", ");
    const comparedResult = await db.execute({
      sql: `
        SELECT id, created_at, name, phone, phone2, duplicate_of
        FROM orders
        WHERE id IN (${placeholders})
      `,
      args: batch,
    });
    for (const row of comparedResult.rows) {
      const value = row as unknown as Record<string, unknown>;
      const id = Number(value.id);
      comparedOrders.set(id, {
        id,
        created_at: String(value.created_at ?? ""),
        name: String(value.name ?? ""),
        phone: String(value.phone ?? ""),
        phone2: String(value.phone2 ?? ""),
        duplicate_of: value.duplicate_of == null ? null : Number(value.duplicate_of),
        items: [],
      });
    }
  }
  for (let offset = 0; offset < comparedOrderIds.length; offset += 500) {
    const batch = comparedOrderIds.slice(offset, offset + 500);
    const placeholders = batch.map(() => "?").join(", ");
    const itemResult = await db.execute({
      sql: `
        SELECT order_id, product_id, product_name, color, size, qty
        FROM order_items
        WHERE order_id IN (${placeholders})
        ORDER BY order_id, id
      `,
      args: batch,
    });
    for (const row of itemResult.rows) {
      const value = row as unknown as Record<string, unknown>;
      const order = comparedOrders.get(Number(value.order_id));
      if (order) {
        order.items.push({
          product_id: String(value.product_id),
          product_name: String(value.product_name),
          color: String(value.color),
          size: String(value.size),
          qty: Number(value.qty),
        });
      }
    }
  }
  const pendingReviewOrders = reviewOrders.map((order) => {
    const comparedOrder = comparedOrders.get(order.id);
    const candidate =
      order.duplicate_of === null
        ? null
        : comparedOrders.get(order.duplicate_of) ?? null;
    const orderPhones = [order.phone, order.phone2]
      .map(normalizeTunisiaPhone)
      .filter((phone): phone is string => phone !== null);
    const candidatePhones = [candidate?.phone, candidate?.phone2]
      .map(normalizeTunisiaPhone)
      .filter((phone): phone is string => phone !== null);

    return {
      ...order,
      items: comparedOrder?.items ?? [],
      candidate,
      phoneMatch: orderPhones.some((phone) => candidatePhones.includes(phone)),
      cartMatch:
        candidate !== null &&
        basketsMatch(comparedOrder?.items ?? [], candidate.items),
    };
  });
  const exportCount = Number(
    (exportCountResult.rows[0] as unknown as { count?: number })?.count ?? 0
  );
  const oldExportedCount = Number(
    (oldExportedResult.rows[0] as unknown as { count?: number })?.count ?? 0
  );

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
    letterSpacing: ".04em",
    whiteSpace: "nowrap",
  };

  return (
    <main className="wrap">
      <AdminNav />

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16,
        marginBottom: 24,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Commandes</h1>
          <p style={{ color: "#78716c", margin: "7px 0 0", fontSize: 14 }}>
            Historique des 200 dernières commandes
          </p>
        </div>

        <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <span style={{
            background: "#fff7ed",
            color: "#9a3412",
            border: "1px solid #fed7aa",
            padding: "9px 12px",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 600,
          }}>
            {exportCount} à exporter
          </span>

          <ExportCsvButton className="btn">
            Exporter CSV Navex
          </ExportCsvButton>

          <ExportCsvButton
            includeAll
            style={{
              padding: "10px 12px",
              border: "1px solid #d6d3d1",
              borderRadius: 9,
              color: "#292524",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              background: "#fff",
            }}
          >
            Tout réexporter
          </ExportCsvButton>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
        gap: 12,
        marginBottom: 22,
      }}>
        <div style={{
          background: "#fff",
          border: "1px solid #e7e5e4",
          borderRadius: 12,
          padding: 17,
        }}>
          <p style={{ margin: 0, color: "#78716c", fontSize: 13 }}>Commandes affichées</p>
          <strong style={{ display: "block", marginTop: 8, fontSize: 27 }}>{rows.length}</strong>
        </div>

        <div style={{
          background: "#fff",
          border: "1px solid #e7e5e4",
          borderRadius: 12,
          padding: 17,
        }}>
          <p style={{ margin: 0, color: "#78716c", fontSize: 13 }}>En attente d’export</p>
          <strong style={{ display: "block", marginTop: 8, fontSize: 27 }}>{exportCount}</strong>
        </div>
      </div>

      <p style={{
        color: "#78716c",
        fontSize: 13,
        marginBottom: 14,
      }}>
        Le prix exporté comprend les articles et les frais de livraison de 8 DT.
        Vérifiez les montants avant l’import Navex.
      </p>

      <OldExportedOrdersCleanup count={oldExportedCount} />

      <OrderReviewQueue orders={pendingReviewOrders} />
      
      <AdminOrdersTable orders={rows} />

    </main>
  );
}

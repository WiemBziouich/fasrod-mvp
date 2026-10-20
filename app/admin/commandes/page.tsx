import db from "@/lib/db";
import AdminOrdersTable from "@/components/AdminOrdersTable";
import AdminNav from "@/components/AdminNav";
import OldExportedOrdersCleanup from "@/components/OldExportedOrdersCleanup";
import ExportCsvButton from "@/components/ExportCsvButton";

export const dynamic = "force-dynamic";

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

export default async function AdminOrdersPage() {
  const [result, oldExportedResult] = await Promise.all([
    db.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 200"),
    db.execute(`
      SELECT COUNT(*) AS count
      FROM orders
      WHERE exported_at IS NOT NULL
        AND datetime(exported_at) <= datetime('now', '-30 days')
    `),
  ]);
  const rows: Order[] = result.rows.map((row) => {
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
    };
  });
  const oldExportedCount = Number(
    (oldExportedResult.rows[0] as unknown as { count?: number })?.count ?? 0
  );

  const pending = rows.filter((order) => !order.exported_at).length;

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
            {pending} à exporter
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
          <strong style={{ display: "block", marginTop: 8, fontSize: 27 }}>{pending}</strong>
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
      
      <AdminOrdersTable orders={rows} />

    </main>
  );
}

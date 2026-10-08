import db from "@/lib/db";
export const dynamic = "force-dynamic";

export default function Admin() {
  const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200").all() as any[];
  const pending = rows.filter((o) => !o.exported_at).length;
  return (
    <main className="wrap">
      <h1>Commandes</h1>
      <p>
        <a className="btn" href="/api/admin/export">Exporter les {pending} nouvelles commandes (CSV Navex)</a>{" "}
        <a href="/api/admin/export?all=1">Tout réexporter (sans marquer)</a>
      </p>
      <p className="muted">Le champ « prix » est pré-rempli (articles + 8 DT). Vérifiez-le avant l'import Navex.</p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Client</th><th>Tél</th><th>Gouvernorat / Ville</th><th>Adresse</th><th>Article</th><th>Articles</th><th>Total</th><th>Export</th></tr></thead>
          <tbody>{rows.map((o) => (
            <tr key={o.id}><td>{o.id}</td><td>{o.created_at}</td><td>{o.name}</td><td>{o.phone}</td>
              <td>{o.governorate} / {o.city}</td><td>{o.address}</td><td>{o.designation}</td>
              <td>{o.item_price} DT</td><td><b>{o.total} DT</b></td><td>{o.exported_at ? "✓" : "—"}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </main>
  );
}

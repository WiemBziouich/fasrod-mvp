"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Batch = {
  id: number;
  created_at: string;
  order_count: number;
  confirmed_at: string | null;
};

export default function ExportBatchesPanel({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function confirmBatch(batch: Batch) {
    if (
      !window.confirm(
        `Confirmer le lot ${batch.id} ?\n\nVérifie d'abord que ${batch.order_count} colis apparaissent bien dans Navex (colis en attente).`
      )
    ) {
      return;
    }

    setBusy(batch.id);
    setError("");
    try {
      const response = await fetch("/api/admin/export/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id }),
      });
      if (!response.ok) {
        throw new Error(`La confirmation a échoué (HTTP ${response.status}).`);
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "La confirmation a échoué."
      );
    } finally {
      setBusy(null);
    }
  }

  if (!batches.length) return null;

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 10px",
    fontSize: 11,
    color: "#57534e",
    textTransform: "uppercase",
    borderBottom: "1px solid #e7e5e4",
  };
  const td: React.CSSProperties = {
    padding: "9px 10px",
    fontSize: 13,
    borderBottom: "1px solid #f5f5f4",
  };

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e7e5e4",
        borderRadius: 12,
        padding: 17,
        marginBottom: 22,
      }}
    >
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Lots d’export Navex</h2>
      <p style={{ margin: "0 0 12px", color: "#78716c", fontSize: 13 }}>
        Après l’import chez Navex, vérifie le nombre de colis puis confirme le
        lot. Seules les commandes confirmées pourront être nettoyées.
      </p>
      {error && (
        <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>
          {error}
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Lot</th>
              <th style={th}>Date</th>
              <th style={th}>Colis</th>
              <th style={th}>Statut</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id}>
                <td style={td}>#{batch.id}</td>
                <td style={td}>{batch.created_at}</td>
                <td style={td}>{batch.order_count}</td>
                <td style={td}>
                  {batch.confirmed_at
                    ? `Import confirmé (${batch.confirmed_at})`
                    : "À confirmer"}
                </td>
                <td style={td}>
                  <a
                    href={`/api/admin/export?batch=${batch.id}`}
                    download
                    style={{ marginRight: 12 }}
                  >
                    Retélécharger
                  </a>
                  {!batch.confirmed_at && (
                    <button
                      type="button"
                      onClick={() => confirmBatch(batch)}
                      disabled={busy === batch.id}
                      style={{ cursor: "pointer" }}
                    >
                      {busy === batch.id ? "..." : "Confirmer l’import"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

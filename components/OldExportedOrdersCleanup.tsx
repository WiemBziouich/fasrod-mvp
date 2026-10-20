"use client";

import { useState } from "react";

export default function OldExportedOrdersCleanup({ count }: { count: number }) {
  const [backupReady, setBackupReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function downloadBackup() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/orders/cleanup-backup", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("La sauvegarde n’a pas pu être créée.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sauvegarde-commandes-exportees-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setBackupReady(true);
      setMessage("Sauvegarde téléchargée. Place-la dans votre dossier de sauvegarde avant de supprimer.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sauvegarde impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteOldOrders() {
    if (!backupReady) return;
    if (!window.confirm(`Supprimer définitivement ${count} commande(s) exportée(s) depuis plus de 30 jours ? Les commandes en attente ne seront pas supprimées.`)) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/orders/cleanup", {
        method: "POST",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("La suppression a échoué.");

      setMessage(`${result.deleted ?? 0} commande(s) supprimée(s). Actualisation…`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Suppression impossible.");
      setBusy(false);
    }
  }

  if (count === 0) {
    return (
      <p style={{ color: "#78716c", fontSize: 13, margin: "4px 0 0" }}>
        Aucune commande exportée depuis plus de 30 jours.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 18, padding: 16, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12 }}>
      <strong>{count} commande(s) exportée(s) depuis plus de 30 jours</strong>
      <p style={{ margin: "7px 0 12px", color: "#7c2d12", fontSize: 13 }}>
        Télécharge la sauvegarde CSV, conserve-la dans votre dossier de sauvegarde, puis supprime manuellement ces anciennes commandes.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={busy} onClick={downloadBackup}>
          {busy ? "Préparation…" : "1. Télécharger la sauvegarde CSV"}
        </button>
        <button type="button" disabled={busy || !backupReady} onClick={deleteOldOrders} style={{ padding: "10px 12px", border: "1px solid #b91c1c", borderRadius: 9, background: backupReady ? "#b91c1c" : "#f5f5f4", color: backupReady ? "#fff" : "#a8a29e", cursor: backupReady ? "pointer" : "not-allowed", fontWeight: 600 }}>
          2. Supprimer ces anciennes commandes
        </button>
      </div>
      {message && <p role="status" style={{ margin: "10px 0 0", fontSize: 13 }}>{message}</p>}
    </div>
  );
}

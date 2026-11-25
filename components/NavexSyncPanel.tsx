"use client";

import { useEffect, useState } from "react";

const parcelStateLabels: Record<string, string> = {
  pending: "En attente",
  depot: "Au dépôt",
  in_transit: "En cours",
  delivered: "Livré",
  returned: "Retourné",
  to_verify: "À vérifier",
  exchange: "Échange",
  unserious: "Client non sérieux",
  other: "Autre",
};

const apiErrorMessages: Record<string, string> = {
  navex_not_configured: "Le client Navex n’est pas configuré.",
  navex_auth: "Jeton Navex refusé.",
  navex_bad_response: "La réponse Navex est invalide. Réessaie plus tard.",
  navex_timeout: "La synchronisation Navex a dépassé le délai autorisé.",
  navex_network: "Navex est momentanément inaccessible. Réessaie plus tard.",
};

function friendlyApiError(code: unknown, fallback: string) {
  return typeof code === "string" ? apiErrorMessages[code] ?? fallback : fallback;
}

const buttonStyle: React.CSSProperties = {
  minHeight: 48,
  padding: "11px 16px",
  border: "0",
  borderRadius: 9,
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const panelStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e7e5e4",
  borderRadius: 12,
  padding: 18,
  marginBottom: 22,
};

export default function NavexSyncPanel() {
  const [status, setStatus] = useState<{
    configured: boolean;
    sync: {
      last_sync_at?: string;
      last_status?: string;
      last_count?: number;
      last_error?: string;
    } | null;
    counts: { state: string; count: number }[];
    otherRawCounts: { state_raw: string; count: number }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/navex/sync", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        friendlyApiError(body?.error, "État Navex indisponible.")
      );
    }
    setStatus(body);
  }

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "État Navex indisponible.")
    );
  }, []);

  async function synchronize() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/navex/sync", { method: "POST" });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          friendlyApiError(result?.error, "La synchronisation a échoué.")
        );
      }
      if (result?.skipped && result.reason === "recent") {
        setNotice("Une synchronisation vient d’avoir lieu. Réessaie dans une minute.");
        await refresh();
        return;
      }
      if (result?.skipped) {
        throw new Error(friendlyApiError("navex_not_configured", ""));
      }
      if (result?.truncated) {
        setNotice(
          "Synchronisation partielle : clique sur Synchroniser pour continuer."
        );
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La synchronisation a échoué.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>Synchronisation Navex</h2>
      <p>Dernière synchronisation : {status?.sync?.last_sync_at ?? "jamais"}</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {(status?.counts ?? []).map((item) => (
          <span key={item.state}>
            {parcelStateLabels[item.state] ?? item.state} : {item.count}
          </span>
        ))}
      </div>
      {(status?.otherRawCounts ?? []).length > 0 && (
        <div style={{ marginTop: 10 }}>
          <strong>États inconnus (other), par libellé brut</strong>
          <ul>
            {status?.otherRawCounts.map((item) => (
              <li key={item.state_raw}>{item.state_raw || "(vide)"} : {item.count}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        disabled={busy || status?.configured !== true}
        onClick={() => void synchronize()}
        style={{ ...buttonStyle, marginTop: 14 }}
      >
        {status?.configured
          ? busy
            ? "Synchronisation…"
            : "Synchroniser maintenant"
          : "Non configuré"}
      </button>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { extractImportedPhones } from "@/lib/phone-import.mjs";
import { maskNavexPhone, parseNavexPaste } from "@/lib/navex-paste.mjs";
import { PAGE_STATES } from "@/lib/navex/page-states.mjs";

type CustomerOrder = {
  id: number;
  date: string;
  status: string;
  exported_at: string | null;
  total: number;
};
type CustomerParcel = {
  code: string;
  state: string;
  motif: string;
  date: string | null;
};
type History = {
  orders: CustomerOrder[];
  parcels: CustomerParcel[];
  flaggedPhones: { phone: string; reason: string; note: string; created_at: string }[];
  openParcelCount: number;
  recentReturns: CustomerParcel[];
  deliveredParcels: CustomerParcel[];
};
type FlaggedPhone = {
  id: number;
  phone: string;
  reason: string;
  note: string;
  active: number;
};

const reasons = [
  ["retour", "Retour"],
  ["injoignable", "Injoignable"],
  ["refus", "Refus"],
] as const;

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
  invalid_request: "Les informations envoyées sont invalides. Vérifie les champs et réessaie.",
  too_many: "Trop de colis dans un seul collage (maximum 1000). Colle les lignes en plusieurs fois.",
  navex_import_failed: "L’import des colis a échoué. Vérifie que la migration des tables a été faite dans Turso, puis réessaie.",
  navex_status_failed: "L’état de synchronisation Navex est indisponible.",
  invalid_phone_count: "Le nombre de numéros est invalide. Vérifie la liste puis réessaie.",
  invalid_phone: "Le numéro de téléphone est invalide.",
  request_failed: "La requête n’a pas abouti. Réessaie dans un instant.",
  not_found: "Ce numéro à risque n’existe plus.",
  unauthorized: "Accès refusé. Connecte-toi à l’administration puis réessaie.",
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

export default function CustomerMemoryAdmin() {
  const [phone, setPhone] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [flags, setFlags] = useState<FlaggedPhone[]>([]);
  const [paste, setPaste] = useState("");
  const [parcelPaste, setParcelPaste] = useState("");
  const [parcelState, setParcelState] =
    useState<(typeof PAGE_STATES)[number]>(PAGE_STATES[0]);
  const [reason, setReason] = useState<(typeof reasons)[number][0]>("retour");
  const [customerFlagReason, setCustomerFlagReason] =
    useState<(typeof reasons)[number][0]>("retour");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pastedPhones = extractImportedPhones(paste);
  const parcelPreview = useMemo(
    () => parseNavexPaste(parcelPaste, parcelState),
    [parcelPaste, parcelState]
  );
  const parcelCodeCount =
    parcelPreview.parcels.length + parcelPreview.ignoredCount;
  const parcelPasteTooLarge = parcelCodeCount > 1000;

  useEffect(() => {
    let active = true;
    fetch("/api/admin/flagged-phones", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            friendlyApiError(body?.error, "Liste des numéros indisponible.")
          );
        }
        if (active) setFlags(body.phones as FlaggedPhone[]);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Liste des numéros indisponible."
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function searchCustomer(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/customer-history?phone=${encodeURIComponent(phone)}`,
        { cache: "no-store" }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(friendlyApiError(body?.error, "Recherche impossible."));
      }
      setHistory(body as History);
      setPhone(phone.replace(/\D/g, "").slice(-8));
      const flaggedResponse = await fetch("/api/admin/flagged-phones", {
        cache: "no-store",
      });
      if (!flaggedResponse.ok) throw new Error("Liste des numéros indisponible.");
      const flaggedBody = await flaggedResponse.json();
      setFlags(flaggedBody.phones as FlaggedPhone[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recherche impossible.");
      setHistory(null);
    } finally {
      setBusy(false);
    }
  }

  async function markPhones(
    phones: string[],
    selectedReason: (typeof reasons)[number][0] = reason
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/flagged-phones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: phones.map((value) => ({
            phone: value,
            reason: selectedReason,
            note: "",
          })),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          friendlyApiError(body?.error, "Enregistrement impossible.")
        );
      }
      setMessage(`${body.count} numéro(s) enregistré(s).`);
      setPaste("");
      const flaggedResponse = await fetch("/api/admin/flagged-phones", {
        cache: "no-store",
      });
      const flaggedBody = await flaggedResponse.json().catch(() => null);
      if (!flaggedResponse.ok) {
        throw new Error(
          friendlyApiError(
            flaggedBody?.error,
            "Liste des numéros indisponible."
          )
        );
      }
      setFlags(flaggedBody.phones as FlaggedPhone[]);
      if (phone) await searchPhone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function searchPhone() {
    const response = await fetch(
      `/api/admin/customer-history?phone=${encodeURIComponent(phone)}`,
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error("Historique client indisponible.");
    setHistory((await response.json()) as History);
  }

  async function toggleFlag(flag: FlaggedPhone) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/flagged-phones/${flag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !flag.active }),
      });
      if (!response.ok) throw new Error("Modification impossible.");
      setFlags((current) =>
        current.map((item) =>
          item.id === flag.id ? { ...item, active: flag.active ? 0 : 1 } : item
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function importNavexParcels() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/navex/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: parcelPaste, stateRaw: parcelState }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          friendlyApiError(result?.error, "Import Navex impossible.")
        );
      }
      const importMessages = [
        `${result.imported} colis importé(s), ${result.ignored} ignoré(s); ${result.updated} état(s) synchronisé(s); ${result.notFound ?? 0} colis introuvable(s) chez Navex.`,
      ];
      if (result.truncated) {
        importMessages.push(
          "Synchronisation partielle : clique sur Synchroniser pour continuer."
        );
      }
      if (result.syncError) {
        importMessages.push(
          friendlyApiError(result.syncError, "La synchronisation Navex a échoué.")
        );
      }
      setMessage(importMessages.join(" "));
      setParcelPaste("");
      window.dispatchEvent(new Event("navex-refresh"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import Navex impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Fiche client</h2>
        <form onSubmit={searchCustomer} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 240px" }}>
            Téléphone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              maxLength={20}
              placeholder="Ex. 21 234 567"
              style={inputStyle}
            />
          </label>
          <button type="submit" disabled={busy} style={{ ...buttonStyle, alignSelf: "end" }}>
            Rechercher
          </button>
        </form>
        {history && (
          <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <section>
              <h3>Commandes du site</h3>
              {history.orders.length ? history.orders.map((order) => (
                <p key={order.id}>#{order.id} · {order.date} · {order.status} · {order.total} DT
                  {order.exported_at ? ` · exportée le ${order.exported_at}` : ""}
                </p>
              )) : <p>Aucune commande trouvée.</p>}
            </section>
            <section>
              <h3>Colis Navex</h3>
              {history.parcels.length ? history.parcels.map((parcel) => (
                <p key={parcel.code}>
                  {parcel.code} · {parcelStateLabels[parcel.state] ?? parcel.state} · {parcel.date ?? "date inconnue"}
                  {parcel.motif ? ` · ${parcel.motif}` : ""}
                </p>
              )) : <p>Aucun colis trouvé.</p>}
              <p>{history.openParcelCount} colis ouverts · {history.recentReturns.length} retour(s) récent(s) · {history.deliveredParcels.length} livré(s)</p>
            </section>
            <section>
              <h3>Numéros à risque</h3>
              {history.flaggedPhones.length ? history.flaggedPhones.map((item) => (
                <p key={item.phone}>{item.phone} · {item.reason} · {item.created_at}{item.note ? ` · ${item.note}` : ""}</p>
              )) : <p>Aucun numéro actif.</p>}
            </section>
            <label>
              Motif du signalement client
              <select
                value={customerFlagReason}
                onChange={(event) =>
                  setCustomerFlagReason(
                    event.target.value as typeof customerFlagReason
                  )
                }
                style={inputStyle}
              >
                {reasons.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || phone.replace(/\D/g, "").slice(-8).length !== 8}
              onClick={() =>
                void markPhones(
                  [phone.replace(/\D/g, "").slice(-8)],
                  customerFlagReason
                )
              }
              style={buttonStyle}
            >
              Marquer retour
            </button>
          </div>
        )}
      </section>

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Importer les colis Navex</h2>
        <p>Collez le texte d’une page de tableau Navex. Les noms et adresses ne sont ni affichés ni enregistrés.</p>
        <label>État de la page d’origine
          <select
            value={parcelState}
            onChange={(event) => setParcelState(event.target.value as typeof parcelState)}
            style={inputStyle}
          >
            {PAGE_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </label>
        <textarea
          value={parcelPaste}
          onChange={(event) => setParcelPaste(event.target.value)}
          rows={7}
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          placeholder="Collez ici le tableau…"
        />
        <p aria-live="polite">
          {parcelPreview.parcels.length} colis trouvés · {parcelPreview.ignoredCount} ignorés
        </p>
        {parcelPasteTooLarge && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            Trop de colis dans un seul collage (maximum 1000). Colle les lignes en plusieurs fois.
          </p>
        )}
        {parcelPreview.parcels.length > 0 && (
          <ul style={{ maxHeight: 180, overflowY: "auto" }}>
            {parcelPreview.parcels.map((item) => (
              <li key={item.code}>
                {item.code} · {maskNavexPhone(item.phone)}
                {item.phone2 ? ` / ${maskNavexPhone(item.phone2)}` : ""}
                {item.parcelDate ? ` · ${item.parcelDate}` : ""}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={busy || parcelPreview.parcels.length === 0 || parcelPasteTooLarge}
          onClick={() => void importNavexParcels()}
          style={buttonStyle}
        >
          Importer et synchroniser
        </button>
      </section>

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Signaler des numéros à risque</h2>
        <p>Collez une liste ou un tableau. Seuls les numéros tunisiens à 8 chiffres sont conservés.</p>
        <textarea
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          rows={4}
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          placeholder="Collez les numéros à signaler…"
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
          <label>Motif pour tout le lot
            <select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} style={inputStyle}>
              {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <strong aria-live="polite">{pastedPhones.length} numéros trouvés</strong>
          <button
            type="button"
            disabled={busy || pastedPhones.length === 0}
            onClick={() => void markPhones(pastedPhones)}
            style={buttonStyle}
          >
            Enregistrer le lot
          </button>
        </div>
      </section>

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Numéros enregistrés</h2>
        {!flags.length ? <p>Aucun numéro enregistré ou liste indisponible.</p> : flags.map((flag) => (
          <div key={flag.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: "1px solid #eee" }}>
            <span>{flag.phone} · {flag.reason} · {flag.active ? "Actif" : "Inactif"}</span>
            <button type="button" disabled={busy} onClick={() => void toggleFlag(flag)} style={{ ...buttonStyle, minHeight: 40 }}>
              {flag.active ? "Désactiver" : "Réactiver"}
            </button>
          </div>
        ))}
      </section>

      {message && <p role="status">{message}</p>}
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      <NavexSyncPanel />
    </div>
  );
}

function NavexSyncPanel() {
  const [status, setStatus] = useState<{
    configured: boolean;
    sync: { last_sync_at?: string; last_status?: string; last_count?: number; last_error?: string } | null;
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
    const handleRefresh = () => {
      void refresh().catch((cause) =>
        setError(cause instanceof Error ? cause.message : "État Navex indisponible.")
      );
    };
    handleRefresh();
    window.addEventListener("navex-refresh", handleRefresh);
    return () => window.removeEventListener("navex-refresh", handleRefresh);
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
      <button type="button" disabled={busy || status?.configured !== true} onClick={() => void synchronize()} style={{ ...buttonStyle, marginTop: 14 }}>
        {status?.configured ? (busy ? "Synchronisation…" : "Synchroniser maintenant") : "Non configuré"}
      </button>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e7e5e4",
  borderRadius: 12,
  padding: 18,
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "11px 12px",
  border: "1px solid #d6d3d1",
  borderRadius: 8,
  font: "inherit",
};

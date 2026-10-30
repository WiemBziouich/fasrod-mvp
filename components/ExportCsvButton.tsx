"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ExportCsvButton({
  includeAll = false,
  children,
  className,
  style,
}: {
  includeAll?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function exportCsv() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/export${includeAll ? "?all=1" : ""}`,
        { cache: "no-store", credentials: "same-origin" }
      );

      if (!response.ok) {
        throw new Error(`Export impossible (HTTP ${response.status}).`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers.get("content-disposition");
      const filename = disposition?.match(/filename="([^"]+)"/i)?.[1];
      link.download =
        filename ?? `commandes-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 5 }}>
      <button
        type="button"
        className={className}
        style={style}
        disabled={busy}
        onClick={exportCsv}
      >
        {busy ? "Téléchargement…" : children}
      </button>
      {error && <small role="alert" style={{ color: "#b91c1c" }}>{error}</small>}
    </span>
  );
}

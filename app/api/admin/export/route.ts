import { NextRequest } from "next/server";
import db from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Anti-injection de formules Excel + retrait des ';' et retours ligne
const cell = (v: unknown) => {
  const s = String(v ?? "").replace(/[;\r\n]+/g, " ").trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
};

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "1";
  const result = await db.execute(
    `SELECT * FROM orders ${all ? "" : "WHERE exported_at IS NULL"} ORDER BY id`
  );
  const rows = result.rows.map((row) => row as unknown as Record<string, unknown>);
  const header =
    "destinataire_nom;adresse;ville;gouvernerat;telephone;telephone2;nombre_de_colis;prix;designation";
  const lines = rows.map((o) =>
    [
      o.name,
      o.address,
      o.city,
      o.governorate,
      o.phone,
      o.phone2,
      1,
      o.total,
      o.designation,
    ]
      .map(cell)
      .join(";")
  );

  if (!all && rows.length) {
    for (const o of rows) {
      await db.execute({
        sql: "UPDATE orders SET exported_at = datetime('now') WHERE id = ?",
        args: [Number(o.id)],
      });
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response([header, ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commandes-${date}.csv"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

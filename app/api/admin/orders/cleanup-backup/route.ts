import { NextRequest } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (value: unknown) => {
  const text = String(value ?? "").replace(/[;\r\n]+/g, " ").trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

export async function GET(_req: NextRequest) {
  const result = await db.execute(`
    SELECT id, created_at, name, address, city, governorate, phone, phone2,
           designation, item_price, delivery_fee, total, exported_at
    FROM orders
    WHERE exported_at IS NOT NULL
      AND datetime(exported_at) <= datetime('now', '-30 days')
    ORDER BY id
  `);

  const header =
    "numero;date;nom;adresse;ville;gouvernorat;telephone;telephone2;designation;prix_articles;frais_livraison;total;date_export";
  const rows = result.rows as unknown as Record<string, unknown>[];
  const lines = rows.map((order) =>
    [
      order.id,
      order.created_at,
      order.name,
      order.address,
      order.city,
      order.governorate,
      order.phone,
      order.phone2,
      order.designation,
      order.item_price,
      order.delivery_fee,
      order.total,
      order.exported_at,
    ].map(cell).join(";")
  );

  const date = new Date().toISOString().slice(0, 10);
  return new Response([header, ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sauvegarde-commandes-exportees-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

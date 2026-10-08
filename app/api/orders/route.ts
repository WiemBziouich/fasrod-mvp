import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getProduct, WILAYAS, DELIVERY_FEE, MAX_QTY } from "@/lib/data";

const hits = new Map<string, number[]>(); // anti-spam simple: 5 commandes / 10 min / IP
const clean = (s: unknown, max: number) => String(s ?? "").replace(/[;\r\n\t]+/g, " ").trim().slice(0, max);
const phoneOf = (s: unknown) => {
  const d = String(s ?? "").replace(/[\s.-]/g, "").replace(/^(\+216|00216)/, "");
  return /^\d{8}$/.test(d) ? d : null;
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  if (recent.length >= 5) return NextResponse.json({ error: "rate" }, { status: 429 });

  const b = await req.json().catch(() => ({}));
  if (b.website) return NextResponse.json({ ok: true, id: 0 }); // honeypot: faux succès pour les bots

  const p = getProduct(b.productId);
  const qty = Number(b.qty);
  if (!p || !p.sizes.includes(b.size) || !p.colors.some((c) => c.name === b.color)
      || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const phone = phoneOf(b.phone);
  const phone2 = b.phone2 ? phoneOf(b.phone2) : phone;
  if (!phone || !phone2) return NextResponse.json({ error: "phone" }, { status: 400 });

  const name = clean(b.name, 80), address = clean(b.address, 200), city = clean(b.city, 60);
  const gov = WILAYAS.find((w) => w.v === b.governorate)?.v;
  if (name.length < 3 || address.length < 5 || city.length < 2 || !gov)
    return NextResponse.json({ error: "fields" }, { status: 400 });

  const itemPrice = p.price * qty; // prix recalculé côté serveur
  const total = itemPrice + DELIVERY_FEE;
  const designation = `${p.name} - ${b.color} - ${b.size}${qty > 1 ? ` x${qty}` : ""}`;
  const r = db.prepare(`INSERT INTO orders (name,address,city,governorate,phone,phone2,product_id,designation,qty,item_price,delivery_fee,total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(name, address, city, gov, phone, phone2, p.id, designation, qty, itemPrice, DELIVERY_FEE, total);
  hits.set(ip, [...recent, now]);
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid), total });
}

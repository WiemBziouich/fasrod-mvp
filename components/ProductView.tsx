"use client";
import { useState, FormEvent } from "react";
import Link from "next/link";
import { Product, WILAYAS, DELIVERY_FEE, MAX_QTY } from "@/lib/data";
import { useI18n } from "./I18n";

export default function ProductView({ p }: { p: Product }) {
  const { t, lang } = useI18n();
  const [img, setImg] = useState(0);
  const [color, setColor] = useState(p.colors[0].name);
  const [size, setSize] = useState(p.sizes[0]);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const total = p.price * qty + DELIVERY_FEE;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, productId: p.id, color, size, qty }) });
      const d = await r.json();
      if (d.ok) setDone(d.id); else setErr(t("e_" + d.error));
    } catch { setErr(t("e_net")); }
    setBusy(false);
  }

  if (done !== null) return (
    <main className="wrap ok"><h1>{t("okTitle")}</h1><p>{t("okText")} <b>#{done}</b></p>
      <Link className="btn" href="/">{t("again")}</Link></main>
  );

  return (
    <main className="wrap">
      <Link href="/" className="muted">← {t("back")}</Link>
      <div className="pdp">
        <div>
          <img className="main" src={p.images[img]} alt={p.name} />
          <div className="thumbs">{p.images.map((s, i) => (
            <img key={s} src={s} alt="" className={i === img ? "on" : ""} onClick={() => setImg(i)} />))}</div>
        </div>
        <div>
          <span className="muted">{p.category}</span>
          <h1>{p.name}</h1>
          <p className="price">{p.price} DT</p>
          <p className="muted">{p.desc[lang]}</p>

          <h3>{t("color")} <span className="muted">{color}</span></h3>
          <div className="row">{p.colors.map((c) => (
            <button key={c.name} type="button" aria-label={c.name} className={"dot" + (c.name === color ? " on" : "")}
              style={{ background: c.hex }} onClick={() => setColor(c.name)} />))}</div>

          <h3>{t("size")}</h3>
          <div className="row">{p.sizes.map((s) => (
            <button key={s} type="button" className={"chip" + (s === size ? " on" : "")} onClick={() => setSize(s)}>{s}</button>))}</div>

          <h3>{t("qty")}</h3>
          <div className="row">{Array.from({ length: MAX_QTY }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={"chip" + (n === qty ? " on" : "")} onClick={() => setQty(n)}>{n}</button>))}</div>

          <form onSubmit={submit} className="form">
            <h2>{t("formTitle")}</h2>
            <input name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden />
            <input name="name" required minLength={3} placeholder={t("name")} autoComplete="name" />
            <input name="phone" required type="tel" inputMode="tel" placeholder={t("phone")} autoComplete="tel" />
            <input name="phone2" type="tel" inputMode="tel" placeholder={t("phone2")} />
            <select name="governorate" required defaultValue="">
              <option value="" disabled>{t("wilaya")}</option>
              {WILAYAS.map((w) => <option key={w.v} value={w.v}>{lang === "ar" ? w.ar : w.v}</option>)}
            </select>
            <input name="city" required placeholder={t("city")} />
            <textarea name="address" required rows={2} placeholder={t("address")} />
            <div className="sum">
              <span>{p.name} × {qty}</span><span>{p.price * qty} DT</span>
              <span>{t("delivery")} <small className="muted">({t("deliveryNote")})</small></span><span>{DELIVERY_FEE} DT</span>
              <b>{t("total")}</b><b>{total} DT</b>
            </div>
            <p className="muted">{t("cod")}</p>
            {err && <p className="err">{err}</p>}
            <button className="btn big" disabled={busy}>{busy ? t("sending") : t("submit")}</button>
          </form>
        </div>
      </div>
    </main>
  );
}

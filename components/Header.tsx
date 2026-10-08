"use client";
import Link from "next/link";
import { useI18n } from "./I18n";

export default function Header() {
  const { lang, setLang, t } = useI18n();
  return (
    <header className="hdr">
      <Link href="/" className="logo">FASROD<small>{t("tagline")}</small></Link>
      <button className="lang" onClick={() => setLang(lang === "fr" ? "ar" : "fr")}>{lang === "fr" ? "عربي" : "Français"}</button>
    </header>
  );
}

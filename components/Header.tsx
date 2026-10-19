"use client";

import Link from "next/link";
import Image from "next/image";
import { useI18n } from "./I18n";
import { useCart } from "./CartContext";

export default function Header() {
  const { lang, setLang, t } = useI18n();
  const { count } = useCart();

  return (
    <header className="hdr">
      <div className="header-inner">

        <Link href="/" className="brand">
          <Image
            src="/brand-icon.png"
            alt="Fasrod"
            width={34}
            height={34}
            className="brand-icon"
            priority
          />

          <span className="logo">
            FASROD
            <small>{t("tagline")}</small>
          </span>
        </Link>

        <div className="header-actions">

          <Link href="/" className="home-link">
            {t("shop")}
          </Link>

          <Link href="/panier" className="cart-btn" aria-label="Panier">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            <span className="cart-btn-text">{lang === "ar" ? "السلة" : "Panier"}</span>
            {count > 0 && <span className="cart-count-badge">{count}</span>}
          </Link>

          <button
            className="lang"
            onClick={() =>
              setLang(lang === "fr" ? "ar" : "fr")
            }
          >
            {lang === "fr" ? "عربي" : "Français"}
          </button>

        </div>
      </div>
    </header>
  );
}
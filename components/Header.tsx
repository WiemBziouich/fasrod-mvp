"use client";

import Link from "next/link";
import Image from "next/image";
import { useI18n } from "./I18n";

export default function Header() {
  const { lang, setLang, t } = useI18n();

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
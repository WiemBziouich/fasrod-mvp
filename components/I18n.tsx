"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

export type Lang = "fr" | "ar";

const D: Record<
  Lang,
  Record<string, string>
> = {
  fr: {
    tagline: "Streetwear tunisien",

    shop: "Boutique",

    all: "Tous nos articles",

    products: "articles",

    search: "Rechercher un article...",

    noResults: "Aucun article trouvé",

    noResultsText:
      "Essaie avec un autre nom ou une autre catégorie.",

    showAll: "Voir tous les articles",

    view: "Voir",

    back: "Retour",

    color: "Couleur",

    size: "Taille",

    qty: "Quantité",

    delivery: "Livraison",

    total: "Total",

    deliveryNote:
      "8 DT partout en Tunisie",

    cod:
      "Tkhallas ki tji el commande (paiement à la livraison)",

    formTitle:
      "Commandi tawa !",

    name:
      "Nom et prénom",

    phone:
      "Téléphone",

    phone2:
      "2ème téléphone (optionnel)",

    wilaya:
      "Ekhtar el wilaya mte3ek",

    city:
      "Ville / délégation",

    address:
      "Adresse complète",

    submit:
      "3adi, commande !",

    sending:
      "Envoi...",

    okTitle:
      "Merci, commande reçue ! 🎉",

    okText:
      "On va t'appeler bientôt pour confirmer. Numéro de commande :",

    again:
      "Retour aux articles",

    related:
      "Tu pourrais aussi aimer",

    relatedText:
      "Des articles qui matchent avec ton style.",

    viewAll:
      "Voir tout",

    e_phone:
      "Numéro invalide : 8 chiffres (ex: 52 123 456).",

    e_fields:
      "Vérifie ton nom, ta wilaya, ta ville et ton adresse.",

    e_rate:
      "Trop de commandes, réessaie dans quelques minutes.",

    e_invalid:
      "Commande invalide, recharge la page.",

    e_net:
      "Problème de connexion, réessaie.",
  },

  ar: {
    tagline:
      "ستريت وير تونسي",

    shop:
      "المتجر",

    all:
      "كل المنتجات",

    products:
      "منتج",

    search:
      "ابحث على منتج...",

    noResults:
      "ما لقيناش المنتج",

    noResultsText:
      "جرّب اسم آخر ولا catégorie أخرى.",

    showAll:
      "شوف المنتجات الكل",

    view:
      "شوف",

    back:
      "رجوع",

    color:
      "اللون",

    size:
      "المقاس",

    qty:
      "الكمية",

    delivery:
      "التوصيل",

    total:
      "المجموع",

    deliveryNote:
      "8 دينار لكامل تونس",

    cod:
      "تخلّص كي تجيك الكوموند (الدفع عند الاستلام)",

    formTitle:
      "اطلب توّا !",

    name:
      "الاسم واللقب",

    phone:
      "نمرة التليفون",

    phone2:
      "تليفون ثاني (اختياري)",

    wilaya:
      "اختار الولاية متاعك",

    city:
      "المدينة / المعتمدية",

    address:
      "العنوان بالتفصيل",

    submit:
      "عادي، كوموند !",

    sending:
      "يبعث...",

    okTitle:
      "بارك الله فيك، الكوموند وصلت ! 🎉",

    okText:
      "باش نعيطولك قريب نأكدو. نمرة الكوموند:",

    again:
      "رجوع للمنتجات",

    related:
      "تنجم يعجبوك زادة",

    relatedText:
      "حاجات أخرى تناسب الستايل متاعك.",

    viewAll:
      "شوف الكل",

    e_phone:
      "النمرة غالطة: 8 أرقام (مثال: 52 123 456).",

    e_fields:
      "ثبّت في الاسم والولاية والمدينة والعنوان.",

    e_rate:
      "برشا كوموندات، عاود بعد شوية.",

    e_invalid:
      "كوموند غالطة، حمّل الصفحة من جديد.",

    e_net:
      "مشكل في الكونيكسيون، عاود.",
  },
};

const Ctx = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string) => string;
}>(null as any);

export const useI18n = () =>
  useContext(Ctx);

export function I18nProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [lang, setLang] =
    useState<Lang>("fr");

  useEffect(() => {
    const s =
      localStorage.getItem("lang");

    if (
      s === "ar" ||
      s === "fr"
    ) {
      setLang(s);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang =
      lang;

    document.documentElement.dir =
      lang === "ar"
        ? "rtl"
        : "ltr";

    localStorage.setItem(
      "lang",
      lang
    );
  }, [lang]);

  return (
    <Ctx.Provider
      value={{
        lang,
        setLang,
        t: (k) =>
          D[lang][k] ?? k,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
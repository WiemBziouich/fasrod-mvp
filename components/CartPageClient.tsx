
"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import {
  DELIVERY_FEE,
  MAX_QTY,
  WILAYAS,
  type Product,
} from "@/lib/data";
import { getDelegations } from "@/lib/tunisia-locations";
import { useCart, cartKey } from "./CartContext";
import { useI18n } from "./I18n";

type FieldErrors = {
  name?: string;
  phone?: string;
  phone2?: string;
  governorate?: string;
  city?: string;
  address?: string;
};

type OrderSummary = {
  id: number;
  name: string;
  phone: string;
  governorate: string;
  city: string;
  total: number;
  itemCount: number;
};

type OrderApiResult = {
  ok?: boolean;
  id?: number;
  total?: number;
  error?: string;
};

function cleanPhone(raw: string): string {
  return raw
    .replace(/[\s.\-_/()]+/g, "")
    .replace(/^(\+216|00216)/, "")
    .replace(/\D/g, "")
    .slice(0, 8);
}

function isValidTunisianPhone(phone: string): boolean {
  return /^\d{8}$/.test(phone);
}

export default function CartPageClient({
  products,
}: {
  products: Product[];
}) {
  const { items, ready, updateQty, removeItem, clear } = useCart();
  const { lang } = useI18n();

  // Catalogue actualisé depuis la même API que la boutique.
  const [liveProducts, setLiveProducts] = useState<Product[]>(products);
  const [productsVerified, setProductsVerified] = useState(false);
  const [productsFetchFailed, setProductsFetchFailed] = useState(false);

  const [busy, setBusy] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [completedOrder, setCompletedOrder] =
    useState<OrderSummary | null>(null);

  const [formValues, setFormValues] = useState({
    name: "",
    phone: "",
    phone2: "",
    governorate: "",
    city: "",
    locality: "",
    address: "",
  });

  // Récupération des produits actuels sans utiliser de cache.
  useEffect(() => {
    let cancelled = false;

    async function refreshProducts() {
      try {
        const response = await fetch("/api/products", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!response.ok) {
          throw new Error("Impossible de récupérer le catalogue.");
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Réponse du catalogue invalide.");
        }

        if (!cancelled) {
          setLiveProducts(data as Product[]);
          setProductsFetchFailed(false);
        }
      } catch (error) {
        if (!cancelled) {
          setProductsFetchFailed(true);
          console.error("Actualisation du panier échouée :", error);
        }
      } finally {
        if (!cancelled) {
          setProductsVerified(true);
        }
      }
    }

    void refreshProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const delegations = useMemo(
    () => getDelegations(formValues.governorate),
    [formValues.governorate]
  );

  const productMap = useMemo(
    () => new Map(liveProducts.map((product) => [product.id, product])),
    [liveProducts]
  );

  // Association des articles avec leurs produits et images.
  const lines = useMemo(() => {
    return items.map((item) => {
      const product = productMap.get(item.productId);
      const colorObj = product?.colors.find(
        (color) => color.name === item.color
      );

      const image =
        colorObj?.images?.[0] ||
        product?.images?.[0] ||
        "/brand-icon.png";

      return {
        ...item,
        product,
        colorObj,
        image,
      };
    });
  }, [items, productMap]);

  const subtotal = lines.reduce(
    (sum, line) =>
      sum + (line.product?.price ?? 0) * line.qty,
    0
  );

  const total = subtotal + (items.length ? DELIVERY_FEE : 0);

  function handleInputChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    const { name, value } = event.target;

    if (name === "governorate") {
      setFormValues((previous) => ({
        ...previous,
        governorate: value,
        city: "",
      }));

      setFieldErrors((previous) => ({
        ...previous,
        governorate: undefined,
        city: undefined,
      }));

      return;
    }

    if (name === "phone" || name === "phone2") {
      const cleaned = cleanPhone(value);

      setFormValues((previous) => ({
        ...previous,
        [name]: cleaned,
      }));

      setFieldErrors((previous) => ({
        ...previous,
        [name]: undefined,
      }));

      return;
    }

    setFormValues((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (name in fieldErrors) {
      setFieldErrors((previous) => ({
        ...previous,
        [name]: undefined,
      }));
    }
  }

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (
      !formValues.name.trim() ||
      formValues.name.trim().length < 3
    ) {
      errors.name =
        lang === "ar"
          ? "الرجاء إدخال الاسم واللقب (3 أحرف على الأقل)."
          : "Veuillez entrer votre nom et prénom (au moins 3 caractères).";
    }

    if (!formValues.phone) {
      errors.phone =
        lang === "ar"
          ? "رقم الهاتف مطلوب لتأكيد التوصيل."
          : "Numéro de téléphone requis pour la confirmation.";
    } else if (!isValidTunisianPhone(formValues.phone)) {
      errors.phone =
        lang === "ar"
          ? "رقم غير صالح : 8 أرقام مطلوبة (مثال: 12 345 678)."
          : "Numéro invalide : 8 chiffres requis (ex: 12 345 678).";
    }

    if (formValues.phone2) {
      if (!isValidTunisianPhone(formValues.phone2)) {
        errors.phone2 =
          lang === "ar"
            ? "الرقم الثاني غير صالح : 8 أرقام مطلوبة."
            : "Le 2ème numéro doit comporter 8 chiffres.";
      } else if (formValues.phone2 === formValues.phone) {
        errors.phone2 =
          lang === "ar"
            ? "الرقم الثاني مطابق للأول، أدخل رقماً مختلفاً أو اتركه فارغاً."
            : "Le 2ème numéro est identique au premier.";
      }
    }

    if (!formValues.governorate) {
      errors.governorate =
        lang === "ar"
          ? "الرجاء اختيار الولاية."
          : "Veuillez choisir votre gouvernorat.";
    }

    if (
      !formValues.city.trim() ||
      formValues.city.trim().length < 2
    ) {
      errors.city =
        lang === "ar"
          ? "الرجاء تحديد المدينة أو المعتمدية."
          : "Veuillez indiquer votre ville ou délégation.";
    }

    if (
      !formValues.address.trim() ||
      formValues.address.trim().length < 5
    ) {
      errors.address =
        lang === "ar"
          ? "الرجاء توضيح العنوان بالتفصيل (الشارع، رقم المنزل، نقطة دالة...)."
          : "Précisez l'adresse complète (rue, n° de maison, repère connu...).";
    }

    setFieldErrors(errors);

    return Object.keys(errors).length === 0;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || !items.length) return;

    setGeneralError("");

    if (!validate()) return;

    // Ne pas envoyer une commande si les produits n'ont pas pu
    // être vérifiés ou si un article est introuvable.
    if (!productsVerified || productsFetchFailed) {
      setGeneralError(
        lang === "ar"
          ? "تعذر التحقق من المنتجات. أعد تحميل الصفحة وحاول مجدداً."
          : "Impossible de vérifier les produits. Rechargez la page puis réessayez."
      );
      return;
    }

    if (lines.some((line) => !line.product)) {
      setGeneralError(
        lang === "ar"
          ? "يوجد منتج لم يعد متوفراً في القائمة الحالية. احذفه من السلة."
          : "Un article est introuvable dans le catalogue actuel. Retirez-le du panier."
      );
      return;
    }

    if (
      lines.some(
        (line) =>
          !line.product?.colors.some(
            (color) => color.name === line.color
          ) ||
          !line.product?.sizes.includes(line.size)
      )
    ) {
      setGeneralError(
        lang === "ar"
          ? "يوجد لون أو مقاس غير متوفر. احذف هذا الخيار من السلة."
          : "Une couleur ou une taille n'est plus disponible. Vérifiez votre panier."
      );
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formValues,
          address: formValues.locality.trim()
            ? `${formValues.locality.trim()} — ${formValues.address.trim()}`
            : formValues.address.trim(),
          items: items.map(({ productId, color, size, qty }) => ({
            productId,
            color,
            size,
            qty,
          })),
        }),
      });

      const result = (await response
        .json()
        .catch(() => ({}))) as OrderApiResult;

      if (!response.ok || !result.ok) {
        const messages: Record<string, string> = {
          invalid:
            lang === "ar"
              ? "تفاصيل المقاس أو اللون غير صحيحة، ثبّت في السلة."
              : "Un article, une couleur ou une taille est invalide.",
          phone:
            lang === "ar"
              ? "رقم الهاتف غير صالح : 8 أرقام تونسية مطلوبة."
              : "Numéro de téléphone invalide : 8 chiffres requis.",
          fields:
            lang === "ar"
              ? "ثبّت في الاسم، العنوان، المدينة والولاية."
              : "Veuillez vérifier les informations de livraison.",
          rate:
            lang === "ar"
              ? "برشا كوموندات، عاود بعد شوية."
              : "Trop de commandes, réessayez dans quelques instants.",
          empty:
            lang === "ar"
              ? "السلة فارغة."
              : "Votre panier est vide.",
          unavailable:
            lang === "ar"
              ? "منتج غير متوفر حالياً، حدّث السلة."
              : "Un article n'est plus disponible.",
          order_failed:
            lang === "ar"
              ? "تعذّر تسجيل الطلب، عاود المحاولة."
              : "La commande n'a pas pu être enregistrée. Réessayez.",
        };

        throw new Error(
          messages[result.error ?? ""] ||
            "Une erreur est survenue."
        );
      }

      setCompletedOrder({
        id: Number(result.id),
        name: formValues.name,
        phone: formValues.phone,
        governorate: formValues.governorate,
        city: formValues.city,
        total: Number(result.total ?? total),
        itemCount: items.reduce(
          (sum, item) => sum + item.qty,
          0
        ),
      });

      clear();
    } catch (error) {
      setGeneralError(
        error instanceof Error
          ? error.message
          : lang === "ar"
            ? "مشكل في الاتصال، عاود المحاولة."
            : "Problème de connexion, veuillez réessayer."
      );
    } finally {
      setBusy(false);
    }
  }

  // Écran de confirmation de commande.
  if (completedOrder) {
    const currentHour = new Date().getHours();
    const isCallingToday =
      currentHour >= 9 && currentHour < 18;

    const wilayaObj = WILAYAS.find(
      (wilaya) => wilaya.v === completedOrder.governorate
    );

    const delegationObj = getDelegations(
      completedOrder.governorate
    ).find(
      (delegation) =>
        delegation.Value === completedOrder.city
    );

    const wilayaDisplay =
      lang === "ar"
        ? wilayaObj?.ar || completedOrder.governorate
        : completedOrder.governorate;

    const cityDisplay = delegationObj
      ? lang === "ar"
        ? delegationObj.NameAr
        : delegationObj.Name
      : completedOrder.city;

    return (
      <main className="wrap ok">
        <div className="success-icon" aria-hidden="true">
          ✓
        </div>

        <h1>
          {lang === "ar"
            ? "وصلتنا الكوموند متاعك ! 🎉"
            : "Wesletna el commande mte3ek ! 🎉"}
        </h1>

        <section
          className="phone-alert-card"
          aria-label="Confirmation téléphonique"
        >
          <div className="phone-alert-header">
            <span style={{ fontSize: "1.4rem" }}>📞</span>
            <span>
              {lang === "ar"
                ? isCallingToday
                  ? "اليوم يكلّموك على الـ confirmation !"
                  : "غدوة الصباح يكلّموك على الـ confirmation !"
                : isCallingToday
                  ? "L'youm ykalmouk 3al confirmation !"
                  : "Ghodwa sbe7 ykalmouk 3al confirmation !"}
            </span>
          </div>

          <ul className="phone-alert-list">
            <li className="phone-alert-item">
              <span className="phone-alert-icon">✅</span>
              <div>
                <strong>
                  {lang === "ar"
                    ? "خلّي تاليفونك محلول وبحذاك :"
                    : "Khalli telfounek ma7loul w ba7dhek :"}
                </strong>{" "}
                <span>
                  {lang === "ar"
                    ? `باش يطلبوك على نومروك (${completedOrder.phone}) ☎️`
                    : `Bech yotlbouk 3al noumrou mte3ek (${completedOrder.phone}) ☎️`}
                </span>
              </div>
            </li>

            <li className="phone-alert-item">
              <span className="phone-alert-icon">👕</span>
              <div>
                <strong>
                  {lang === "ar"
                    ? "كان عندك حاجة تحب تبدّلها :"
                    : "Ken 3andek 7aja t7eb tbadelha :"}
                </strong>{" "}
                <span>
                  {lang === "ar"
                    ? "أكّد عليهم الألوان والمقاس (taille) في التاليفون."
                    : "Akked 3lihom les couleurs wel taille f telfoun."}
                </span>
              </div>
            </li>
          </ul>

          <div className="phone-alert-critical">
            <span style={{ fontSize: "1.2rem" }}>⚠️</span>
            <span>
              {lang === "ar"
                ? "رد بالك : كان ما تحصّلوش عليك، الكوموند ما تخرجش ! ❌"
                : "Rod belek : Ken ma t7aslouch 3lik, el commande ma tokhrojech ! ❌"}
            </span>
          </div>
        </section>

        <div className="order-success-card">
          <div className="order-recap-row">
            <span className="muted">
              {lang === "ar" ? "الاسم" : "Esm w la9ab"}
            </span>
            <strong>{completedOrder.name}</strong>
          </div>

          <div className="order-recap-row">
            <span className="muted">
              {lang === "ar" ? "التاليفون" : "Numéro"}
            </span>
            <strong dir="ltr">{completedOrder.phone}</strong>
          </div>

          <div className="order-recap-row">
            <span className="muted">
              {lang === "ar" ? "التوصيل" : "Livraison"}
            </span>
            <strong>
              {wilayaDisplay} — {cityDisplay}
            </strong>
          </div>

          <div className="order-recap-row">
            <span className="muted">
              {lang === "ar" ? "عدد القطع" : "Articles"}
            </span>
            <span>
              {lang === "ar"
                ? `${completedOrder.itemCount} قطعة`
                : `${completedOrder.itemCount} pièce(s)`}
            </span>
          </div>

          <div
            className="order-recap-row"
            style={{ paddingTop: 10, fontSize: "1.1rem" }}
          >
            <span>
              <strong>
                {lang === "ar"
                  ? "المجموع كاش عند الاستلام"
                  : "Total à payer "}
              </strong>
            </span>

            <strong
              style={{
                fontSize: "1.25rem",
                color: "var(--fg)",
              }}
            >
              {completedOrder.total}{" "}
              {lang === "ar" ? "د.ت" : "DT"}
            </strong>
          </div>

          <small
            className="muted"
            style={{ fontSize: "0.78rem" }}
          >
            {lang === "ar"
              ? "* معلوم التوصيل (8 د.ت) لكامل تونس محسوب في المجموع."
              : "* Frais fixes de livraison (8 DT) partout en Tunisie inclus."}
          </small>
        </div>

        <div
          style={{
            marginTop: 24,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link
            className="btn big"
            href="/"
            style={{ minWidth: 220 }}
          >
            {lang === "ar"
              ? "← ارجع للمتجر"
              : "← Arja3 lel boutique"}
          </Link>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="wrap">
        <p
          className="muted"
          style={{
            padding: "40px 0",
            textAlign: "center",
          }}
        >
          {lang === "ar"
            ? "جاري تحميل السلة…"
            : "Chargement du panier…"}
        </p>
      </main>
    );
  }

  return (
    <main className="wrap">
      <Link href="/" className="back-link muted">
        {lang === "ar"
          ? "← واصل التسوّق"
          : "← Continuer les achats"}
      </Link>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          margin: "16px 0 20px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(1.5rem, 3vw, 2rem)",
          }}
        >
          {lang === "ar" ? "سلة المشتريات" : "Mon panier"}
        </h1>

        {items.length > 0 && (
          <span
            className="muted"
            style={{ fontSize: "0.9rem" }}
          >
            {items.reduce((sum, item) => sum + item.qty, 0)}{" "}
            {lang === "ar" ? "قطعة" : "pièce(s)"}
          </span>
        )}
      </div>

      {!items.length ? (
        <div
          className="form"
          style={{
            textAlign: "center",
            padding: "45px 20px",
          }}
        >
          <p
            style={{
              fontSize: "1.1rem",
              margin: "0 0 16px",
            }}
          >
            {lang === "ar"
              ? "سلتك فارغة حالياً."
              : "Ton panier est vide."}
          </p>

          <Link
            href="/"
            className="btn"
            style={{ margin: "auto" }}
          >
            {lang === "ar"
              ? "اكتشف تشكيلة Fasrod"
              : "Découvrir les articles"}
          </Link>
        </div>
      ) : (
        <>
          <div
            className="form"
            style={{
              padding: "16px 18px",
              marginTop: 0,
            }}
          >
            <div className="cart-items-list">
              {lines.map((line) => {
                const key = cartKey(line);

                if (!productsVerified || productsFetchFailed || !line.product) {
                  return (
                    <div
                      key={key}
                      className="cart-item-card"
                    >
                      <div className="cart-item-info">
                        <p className="err">
                          {!productsVerified
                            ? lang === "ar"
                              ? "جاري التحقق من المنتج..."
                              : "Vérification du produit..."
                            : productsFetchFailed
                              ? lang === "ar"
                                ? "تعذر التحقق من المنتج. أعد تحميل الصفحة."
                                : "Impossible de vérifier le produit. Rechargez la page."
                              : lang === "ar"
                                ? "هذا المنتج لم يعد متوفراً."
                                : "Ce produit est introuvable dans le catalogue actuel."}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="cart-remove-btn"
                        onClick={() => removeItem(key)}
                      >
                        ✕ {lang === "ar" ? "حذف" : "Retirer"}
                      </button>
                    </div>
                  );
                }

                const colorExists = Boolean(line.colorObj);
                const sizeExists = line.product.sizes.includes(
                  line.size
                );
                const itemTotal =
                  line.product.price * line.qty;

                return (
                  <article
                    key={key}
                    className="cart-item-card"
                  >
                    <Link
                      href={`/produit/${line.product.id}`}
                      className="cart-item-thumb-link"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <img
                        src={line.image}
                        alt={line.product.name}
                        className="cart-item-thumb"
                        loading="lazy"
                      />
                    </Link>

                    <div className="cart-item-info">
                      <div className="cart-item-header">
                        <Link
                          href={`/produit/${line.product.id}`}
                          className="cart-item-title"
                        >
                          {line.product.name}
                        </Link>

                        <span className="cart-item-price">
                          {itemTotal} DT
                        </span>
                      </div>

                      <div className="cart-item-meta">
                        <span className="cart-badge-pill">
                          <span
                            className="cart-color-dot"
                            style={{
                              background:
                                line.colorObj?.hex || "#999",
                            }}
                          />
                          {line.color}
                        </span>

                        <span className="cart-badge-pill">
                          {line.size}
                        </span>

                        <span
                          className="muted"
                          style={{ fontSize: "0.78rem" }}
                        >
                          ({line.product.price} DT / pc)
                        </span>
                      </div>

                      {(!colorExists || !sizeExists) && (
                        <p
                          className="err"
                          style={{
                            fontSize: "0.8rem",
                            margin: "2px 0",
                          }}
                        >
                          {lang === "ar"
                            ? "هذا الخيار غير متوفر حالياً، يرجى حذفه."
                            : "Cette variante n'est plus disponible."}
                        </p>
                      )}

                      <div className="cart-item-actions">
                        <div
                          className="qty-stepper"
                          role="group"
                          aria-label="Quantité"
                        >
                          <button
                            type="button"
                            className="qty-btn"
                            disabled={busy || line.qty <= 1}
                            onClick={() =>
                              updateQty(key, line.qty - 1)
                            }
                            aria-label="Diminuer"
                          >
                            −
                          </button>

                          <span className="qty-value">
                            {line.qty}
                          </span>

                          <button
                            type="button"
                            className="qty-btn"
                            disabled={
                              busy || line.qty >= MAX_QTY
                            }
                            onClick={() =>
                              updateQty(key, line.qty + 1)
                            }
                            aria-label="Augmenter"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          className="cart-remove-btn"
                          disabled={busy}
                          onClick={() => removeItem(key)}
                        >
                          ✕ {lang === "ar" ? "حذف" : "Retirer"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="sum" style={{ marginTop: 14 }}>
              <span>
                {lang === "ar"
                  ? "مجموع المنتجات"
                  : "Sous-total articles"}
              </span>
              <strong>{subtotal} DT</strong>

              <span>
                {lang === "ar"
                  ? "التوصيل لكامل تونس"
                  : "Livraison partout en Tunisie"}
              </span>
              <strong>
                {items.length ? DELIVERY_FEE : 0} DT
              </strong>

              <b style={{ fontSize: "1.1rem" }}>
                {lang === "ar"
                  ? "المجموع الجملي"
                  : "Total à payer"}
              </b>
              <b
                style={{
                  fontSize: "1.2rem",
                  color: "var(--fg)",
                }}
              >
                {total} DT
              </b>
            </div>
          </div>

          <form
            className="form"
            onSubmit={submit}
            noValidate
          >
            <h2
              style={{
                fontSize: "1.2rem",
                margin: "0 0 4px",
              }}
            >
              {lang === "ar"
                ? "معلومات التوصيل (الدفع عند الاستلام)"
                : "Coordonnées de livraison"}
            </h2>

            <p
              className="muted"
              style={{
                fontSize: "0.85rem",
                margin: "0 0 14px",
              }}
            >
              {lang === "ar"
                ? "الرجاء كتابة معلومات دقيقة لتسريع وصول طلبك."
                : "Remplissez ce formulaire pour recevoir votre commande."}
            </p>

            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="hp"
              aria-hidden="true"
            />

            <div className="form-group">
              <label
                htmlFor="field-name"
                className="form-label"
              >
                <span>
                  {lang === "ar"
                    ? "الاسم واللقب *"
                    : "Nom et prénom *"}
                </span>
                <span className="form-hint">
                  {lang === "ar"
                    ? "مثال: الاسم واللقب"
                    : "Ex: Prénom & Nom"}
                </span>
              </label>

              <input
                id="field-name"
                name="name"
                required
                minLength={3}
                maxLength={80}
                value={formValues.name}
                onChange={handleInputChange}
                className={
                  fieldErrors.name ? "input-error" : ""
                }
                placeholder={
                  lang === "ar"
                    ? "الاسم واللقب"
                    : "Votre nom et prénom"
                }
                autoComplete="name"
              />

              {fieldErrors.name && (
                <p role="alert" className="field-error-msg">
                  ⚠️ {fieldErrors.name}
                </p>
              )}
            </div>

            <div className="form-group">
              <label
                htmlFor="field-phone"
                className="form-label"
              >
                <span>
                  {lang === "ar"
                    ? "رقم الهاتف الأساسي *"
                    : "Téléphone principal *"}
                </span>
                <span className="form-hint">
                  {lang === "ar"
                    ? "8 أرقام (مثال: 12 345 678)"
                    : "8 chiffres (ex: 12 345 678)"}
                </span>
              </label>

              <input
                id="field-phone"
                name="phone"
                required
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={formValues.phone}
                onChange={handleInputChange}
                className={
                  fieldErrors.phone ? "input-error" : ""
                }
                placeholder={
                  lang === "ar"
                    ? "مثال: 12 345 678"
                    : "Ex: 12 345 678"
                }
                autoComplete="tel"
              />

              {fieldErrors.phone && (
                <p role="alert" className="field-error-msg">
                  ⚠️ {fieldErrors.phone}
                </p>
              )}
            </div>

            <div className="form-group">
              <label
                htmlFor="field-phone2"
                className="form-label"
              >
                <span>
                  {lang === "ar"
                    ? "هاتف ثانٍ (اختياري لكن مفيد)"
                    : "Deuxième téléphone (facultatif)"}
                </span>
                <span className="form-hint">
                  {lang === "ar"
                    ? "في حال تعذّر الاتصال بالرقم الأول"
                    : "Recommandé pour le livreur"}
                </span>
              </label>

              <input
                id="field-phone2"
                name="phone2"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={formValues.phone2}
                onChange={handleInputChange}
                className={
                  fieldErrors.phone2 ? "input-error" : ""
                }
                placeholder={
                  lang === "ar"
                    ? "رقم ثانٍ للاحتياط"
                    : "Ex: 12 345 678 (facultatif)"
                }
              />

              {fieldErrors.phone2 && (
                <p role="alert" className="field-error-msg">
                  ⚠️ {fieldErrors.phone2}
                </p>
              )}
            </div>

            <div className="form-group">
              <label
                htmlFor="field-governorate"
                className="form-label"
              >
                <span>
                  {lang === "ar"
                    ? "الولاية *"
                    : "Gouvernorat (Wilaya) *"}
                </span>
              </label>

              <select
                id="field-governorate"
                name="governorate"
                required
                value={formValues.governorate}
                onChange={handleInputChange}
                className={
                  fieldErrors.governorate ? "input-error" : ""
                }
              >
                <option value="" disabled>
                  {lang === "ar"
                    ? "— اختر الولاية —"
                    : "— Sélectionner votre gouvernorat —"}
                </option>

                {WILAYAS.map((wilaya) => (
                  <option
                    key={wilaya.v}
                    value={wilaya.v}
                  >
                    {lang === "ar" ? wilaya.ar : wilaya.v}
                  </option>
                ))}
              </select>

              {fieldErrors.governorate && (
                <p role="alert" className="field-error-msg">
                  ⚠️ {fieldErrors.governorate}
                </p>
              )}
            </div>

            <div className="form-group">
              <label
                htmlFor="field-city"
                className="form-label"
              >
                <span>
                  {lang === "ar"
                    ? "المدينة / المعتمدية *"
                    : "Ville / délégation *"}
                </span>
                <span className="form-hint">
                  {lang === "ar"
                    ? "اختر المعتمدية"
                    : "Choisissez d’abord votre gouvernorat"}
                </span>
              </label>

              <select
                id="field-city"
                name="city"
                required
                value={formValues.city}
                onChange={handleInputChange}
                className={
                  fieldErrors.city ? "input-error" : ""
                }
                disabled={!formValues.governorate}
              >
                <option value="" disabled>
                  {!formValues.governorate
                    ? lang === "ar"
                      ? "— اختر الولاية أولاً —"
                      : "— Choisir d’abord le gouvernorat —"
                    : lang === "ar"
                      ? "— اختر المعتمدية —"
                      : "— Sélectionner la délégation —"}
                </option>

                {delegations.map((delegation) => (
                  <option
                    key={delegation.Value}
                    value={delegation.Value}
                  >
                    {lang === "ar"
                      ? delegation.NameAr
                      : delegation.Name}
                  </option>
                ))}
              </select>

              {fieldErrors.city && (
                <p role="alert" className="field-error-msg">
                  ⚠️ {fieldErrors.city}
                </p>
              )}
            </div>

            <div className="form-group">
              <label
                htmlFor="field-locality"
                className="form-label"
              >
                <span>
                  {lang === "ar"
                    ? "المنطقة / الحي (اختياري)"
                    : "Localité / quartier (facultatif)"}
                </span>
                <span className="form-hint">
                  {lang === "ar"
                    ? "مثال: حي النصر"
                    : "Ex: Cité Ennasr"}
                </span>
              </label>

              <input
                id="field-locality"
                name="locality"
                maxLength={80}
                value={formValues.locality}
                onChange={handleInputChange}
                placeholder={
                  lang === "ar"
                    ? "مثال: حي النصر"
                    : "Ex: Cité Ennasr"
                }
                autoComplete="address-level3"
              />
            </div>

            <div className="form-group">
              <label
                htmlFor="field-address"
                className="form-label"
              >
                <span>
                  {lang === "ar"
                    ? "العنوان بالتفصيل *"
                    : "Adresse complète *"}
                </span>
                <span className="form-hint">
                  {lang === "ar"
                    ? "الشارع، رقم المنزل، نقطة دالة"
                    : "Rue, repère, n°..."}
                </span>
              </label>

              <textarea
                id="field-address"
                name="address"
                required
                minLength={5}
                maxLength={200}
                rows={2}
                value={formValues.address}
                onChange={handleInputChange}
                className={
                  fieldErrors.address ? "input-error" : ""
                }
                placeholder={
                  lang === "ar"
                    ? "مثال: شارع الحبيب بورقيبة، تونس..."
                    : "Ex: Avenue Habib Bourguiba, Tunis..."
                }
              />

              {fieldErrors.address && (
                <p role="alert" className="field-error-msg">
                  ⚠️ {fieldErrors.address}
                </p>
              )}
            </div>

            <div className="cart-security-badge">
              <span>🤝</span>
              <span>
                {lang === "ar"
                  ? "الدفع كاش عند الاستلام : تخلّص كي يوصلك الكولي ليدك."
                  : "Paiement en espèces à la livraison. Vous payez à la réception du colis."}
              </span>
            </div>

            {generalError && (
              <p
                role="alert"
                className="err"
                style={{ padding: "8px 0" }}
              >
                ⚠️ {generalError}
              </p>
            )}

            <button
              className="btn big"
              type="submit"
              disabled={busy || !items.length}
              style={{
                marginTop: 8,
                fontSize: "1.12rem",
                padding: "16px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 10,
              }}
            >
              {busy ? (
                <span>
                  {lang === "ar"
                    ? "جاري الإرسال…"
                    : "Envoi en cours…"}
                </span>
              ) : (
                <span>
                  {lang === "ar"
                    ? `تأكيد الطلب — ${total} د.ت`
                    : `3adi el commande — ${total} DT`}
                </span>
              )}
            </button>
          </form>
        </>
      )}
    </main>
  );
}

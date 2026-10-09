export const DELIVERY_FEE = 8;
export const MAX_QTY = 3;

// "v" = orthographe EXACTE attendue par Navex (ne pas modifier)
export const WILAYAS = [
  ["Ariana", "أريانة"],
  ["Béja", "باجة"],
  ["Ben Arous", "بن عروس"],
  ["Bizerte", "بنزرت"],
  ["Gabès", "قابس"],
  ["Gafsa", "قفصة"],
  ["Jendouba", "جندوبة"],
  ["Kairouan", "القيروان"],
  ["Kasserine", "القصرين"],
  ["Kébili", "قبلي"],
  ["La Mannouba", "منوبة"],
  ["Le Kef", "الكاف"],
  ["Mahdia", "المهدية"],
  ["Médenine", "مدنين"],
  ["Monastir", "المنستير"],
  ["Nabeul", "نابل"],
  ["Sfax", "صفاقس"],
  ["Sidi Bouzid", "سيدي بوزيد"],
  ["Siliana", "سليانة"],
  ["Sousse", "سوسة"],
  ["Tataouine", "تطاوين"],
  ["Tozeur", "توزر"],
  ["Tunis", "تونس"],
  ["Zaghouan", "زغوان"],
].map(([v, ar]) => ({ v, ar }));

export type ProductColor = {
  name: string;
  hex: string;
  images?: string[];
};

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  desc: {
    fr: string;
    ar: string;
  };
  images: string[];
  colors: ProductColor[];
  sizes: string[];
  active: boolean;
};

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: "camo-baggy",
    name: "Camo Baggy",
    category: "Shorts",
    price: 57,

    desc: {
      fr: "Baggy camo confortable pour tous les jours.",
      ar: "بانتاليه كامو مريح للاستعمال اليومي.",
    },

    images: [
      "/products/camo-1.png",
      "/products/camo-2.png",
    ],

    colors: [
      {
        name: "Beige",
        hex: "#d8c3a0",
      },
      {
        name: "Vert",
        hex: "#4a5d3a",
      },
      {
        name: "Marron",
        hex: "#6b4a38",
      },
    ],

    sizes: SIZES,
    active: true,
  },

  {
    id: "baggy-noir",
    name: "Baggy Noir",
    category: "Pantalons",
    price: 43,

    desc: {
      fr: "Baggy noir, coupe ample.",
      ar: "بانتاليه كحل، قصة واسعة.",
    },

    images: [
      "/products/noir-1.png",
    ],

    colors: [
      {
        name: "Noir",
        hex: "#111111",
      },
    ],

    sizes: SIZES,
    active: true,
  },
];
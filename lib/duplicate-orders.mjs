const STATUS_VALUES = [
  "normal",
  "pending_review",
  "confirmed_new",
  "confirmed_duplicate",
];

export const EXPORTABLE_ORDER_STATUSES = Object.freeze([
  "normal",
  "confirmed_new",
]);

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeTunisiaPhone(value) {
  const raw = String(value ?? "").trim();
  let digits = "";

  for (const [index, char] of Array.from(raw).entries()) {
    const arabicIndex = ARABIC_DIGITS.indexOf(char);
    const persianIndex = PERSIAN_DIGITS.indexOf(char);
    if (arabicIndex >= 0) {
      digits += String(arabicIndex);
    } else if (persianIndex >= 0) {
      digits += String(persianIndex);
    } else if (char >= "0" && char <= "9") {
      digits += char;
    } else if (char === "+" && index === 0) {
      continue;
    } else if (!/[\s.()/_-]/.test(char)) {
      return null;
    }
  }

  if (digits.length === 13 && digits.startsWith("00216")) {
    digits = digits.slice(5);
  } else if (digits.length === 11 && digits.startsWith("216")) {
    digits = digits.slice(3);
  }

  return /^\d{8}$/.test(digits) ? digits : null;
}

export function normalizeBasket(items) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const lines = [];
  const seen = new Set();

  for (const item of items) {
    if (
      !item ||
      typeof item.product_id !== "string" ||
      typeof item.color !== "string" ||
      typeof item.size !== "string" ||
      !Number.isInteger(Number(item.qty)) ||
      Number(item.qty) < 1
    ) {
      return null;
    }

    const line = [
      item.product_id,
      item.color,
      item.size,
      Number(item.qty),
    ];
    const key = JSON.stringify(line);
    if (seen.has(key)) return null;
    seen.add(key);
    lines.push(line);
  }

  lines.sort((left, right) => {
    for (let index = 0; index < left.length; index += 1) {
      const comparison = String(left[index]).localeCompare(
        String(right[index]),
        "en"
      );
      if (comparison !== 0) return comparison;
    }
    return 0;
  });

  return JSON.stringify(lines);
}

export function basketsMatch(left, right) {
  const normalizedLeft = normalizeBasket(left);
  return normalizedLeft !== null && normalizedLeft === normalizeBasket(right);
}

export function isOrderStatus(value) {
  return STATUS_VALUES.includes(value);
}

export function isExportableOrderStatus(value) {
  return EXPORTABLE_ORDER_STATUSES.includes(value);
}

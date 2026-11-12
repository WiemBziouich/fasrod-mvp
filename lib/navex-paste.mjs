import { normalizeTunisiaPhone } from "./duplicate-orders.mjs";
import { mapEtat } from "./navex/state-map-core.mjs";

const CODE_PATTERN = /\b\d{12}\b/g;
const PHONE_PATTERN = /\b[2-9]\d{7}\b/g;
const DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/;
const KNOWN_MOTIFS = [
  "Client disponible demain",
  "Client non disponible",
  "Commande non conforme",
  "A vérifier avec expéditeur",
  "Client non sérieux",
];

export function parseNavexPaste(text, stateRaw) {
  const codes = Array.from(text.matchAll(CODE_PATTERN));
  const parcels = [];
  for (let index = 0; index < codes.length; index += 1) {
    const match = codes[index];
    const start = match.index + match[0].length;
    const end = index + 1 < codes.length ? codes[index + 1].index : text.length;
    const parcelText = text.slice(start, end);
    const followingPhones = Array.from(
      parcelText.matchAll(PHONE_PATTERN),
      (phone) => phone[0]
    ).slice(0, 2);
    if (!followingPhones.length) continue;
    const dateMatch = DATE_PATTERN.exec(parcelText);
    parcels.push({
      code: match[0],
      phone: followingPhones[0],
      phone2: followingPhones[1] ?? "",
      state: mapEtat(stateRaw),
      stateRaw,
      motif: findKnownMotif(parcelText),
      parcelDate: dateMatch && isCalendarDate(dateMatch[0]) ? dateMatch[0] : null,
    });
  }
  return {
    parcels,
    ignoredCount: codes.length - parcels.length,
  };
}

function findKnownMotif(text) {
  const normalizedText = normalizeMotif(text);
  let match = null;
  for (const phrase of KNOWN_MOTIFS) {
    const index = normalizedText.indexOf(normalizeMotif(phrase));
    if (index !== -1 && (!match || index < match.index)) {
      match = { index, phrase };
    }
  }
  return match?.phrase ?? "";
}

function normalizeMotif(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function maskNavexPhone(phone) {
  return `${phone.slice(0, 1)}••••${phone.slice(-3)}`;
}

export function findUniqueRecentExport(phone, phone2, recentOrders) {
  const phones = Array.from(
    new Set([phone, phone2].map(normalizeTunisiaPhone).filter(Boolean))
  );
  if (!phones.length) return null;
  const matches = recentOrders.filter((row) =>
    [String(row.phone ?? ""), String(row.phone2 ?? "")]
      .map(normalizeTunisiaPhone)
      .some((value) => value !== null && phones.includes(value))
  );
  return matches.length === 1 ? Number(matches[0].id) : null;
}

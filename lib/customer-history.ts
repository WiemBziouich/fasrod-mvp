import db from "@/lib/db";
import { normalizeTunisiaPhone } from "@/lib/duplicate-orders.mjs";
import { getParcelReviewSignals } from "@/lib/customer-risk.mjs";
import {
  EXPORTED_ORDER_REVIEW_DAYS,
  IGNORED_PARCEL_MOTIF,
  OPEN_PARCEL_REVIEW_DAYS,
  OPEN_PARCEL_STATES,
  RETURN_REVIEW_DAYS,
} from "@/lib/risk-config";

export type CustomerOrderHistory = {
  id: number;
  date: string;
  status: string;
  exported_at: string | null;
  total: number;
};

export type CustomerParcelHistory = {
  code: string;
  state: string;
  motif: string;
  date: string | null;
};

export type CustomerHistory = {
  orders: CustomerOrderHistory[];
  parcels: CustomerParcelHistory[];
  flaggedPhones: {
    phone: string;
    reason: string;
    note: string;
    created_at: string;
  }[];
  openParcelCount: number;
  recentReturns: CustomerParcelHistory[];
  deliveredParcels: CustomerParcelHistory[];
};

const emptyHistory = (): CustomerHistory => ({
  orders: [],
  parcels: [],
  flaggedPhones: [],
  openParcelCount: 0,
  recentReturns: [],
  deliveredParcels: [],
});

function isMissingHistorySchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such (?:table|column)/i.test(message);
}

export async function getCustomerHistory(
  phones: string[]
): Promise<CustomerHistory> {
  const normalizedPhones = Array.from(
    new Set(
      phones
        .map(normalizeTunisiaPhone)
        .filter((phone): phone is string => phone !== null)
    )
  );
  if (!normalizedPhones.length) return emptyHistory();

  const phoneVariants = Array.from(
    new Set(
      normalizedPhones.flatMap((phone) => [phone, `216${phone}`, `00216${phone}`])
    )
  );
  const placeholders = phoneVariants.map(() => "?").join(", ");
  const comparablePhone = (column: string) =>
    `replace(replace(replace(replace(replace(replace(replace(replace(${column}, ' ', ''), '-', ''), '+', ''), '.', ''), '(', ''), ')', ''), '/', ''), '_', '')`;
  const history = emptyHistory();
  const orderRead = db
    .execute({
      sql: `
        SELECT id, created_at, duplicate_status, exported_at, total
        FROM orders
        WHERE ${comparablePhone("phone")} IN (${placeholders})
           OR ${comparablePhone("phone2")} IN (${placeholders})
        ORDER BY datetime(created_at) DESC, id DESC
      `,
      args: [...phoneVariants, ...phoneVariants],
    })
    .then((result) => {
      history.orders = result.rows.map((row) => ({
        id: Number(row.id),
        date: String(row.created_at ?? ""),
        status: String(row.duplicate_status ?? "normal"),
        exported_at: row.exported_at == null ? null : String(row.exported_at),
        total: Number(row.total ?? 0),
      }));
    })
    .catch((error) => {
      if (isMissingHistorySchema(error)) return;
      console.warn("Customer order history read failed.");
      throw error;
    });

  const flaggedRead = db
    .execute({
      sql: `SELECT phone, reason, note, created_at FROM flagged_phones
            WHERE active = 1 AND phone IN (${placeholders})`,
      args: phoneVariants,
    })
    .then((result) => {
      history.flaggedPhones = result.rows.map((row) => ({
        phone: String(row.phone),
        reason: String(row.reason),
        note: String(row.note ?? ""),
        created_at: String(row.created_at ?? ""),
      }));
    })
    .catch((error) => {
      if (isMissingHistorySchema(error)) return;
      console.warn("Flagged-phone history read failed.");
      throw error;
    });

  const parcelRead = db
    .execute({
      sql: `
        SELECT code, state, motif,
          COALESCE(parcel_date, first_seen_at) AS parcel_date
        FROM navex_parcels
        WHERE ${comparablePhone("phone")} IN (${placeholders})
           OR ${comparablePhone("phone2")} IN (${placeholders})
        ORDER BY datetime(COALESCE(parcel_date, first_seen_at)) DESC, code
      `,
      args: [...phoneVariants, ...phoneVariants],
    })
    .then((result) => {
      const parcels = result.rows.map((row) => ({
        code: String(row.code),
        state: String(row.state),
        motif: String(row.motif ?? ""),
        date: row.parcel_date == null ? null : String(row.parcel_date),
      }));
      history.parcels = parcels;
      const risks = getParcelReviewSignals(parcels, {
        openStates: OPEN_PARCEL_STATES,
        ignoredMotif: IGNORED_PARCEL_MOTIF,
        openDays: OPEN_PARCEL_REVIEW_DAYS,
        returnDays: RETURN_REVIEW_DAYS,
      });
      history.openParcelCount = risks.openParcels.length;
      history.recentReturns = risks.recentReturns;
      history.deliveredParcels = parcels.filter(
        (parcel) => parcel.state === "delivered"
      );
    })
    .catch((error) => {
      if (isMissingHistorySchema(error)) return;
      console.warn("Navex parcel history read failed.");
      throw error;
    });

  await Promise.all([orderRead, flaggedRead, parcelRead]);
  return history;
}

export { EXPORTED_ORDER_REVIEW_DAYS };

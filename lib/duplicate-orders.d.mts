export type OrderStatus =
  | "normal"
  | "pending_review"
  | "confirmed_new"
  | "confirmed_duplicate";

export type BasketItem = {
  product_id: string;
  color: string;
  size: string;
  qty: number;
};

export const EXPORTABLE_ORDER_STATUSES: readonly (
  | "normal"
  | "confirmed_new"
)[];

export function normalizeTunisiaPhone(value: unknown): string | null;
export function normalizeBasket(items: readonly BasketItem[]): string | null;
export function basketsMatch(
  left: readonly BasketItem[],
  right: readonly BasketItem[]
): boolean;
export function isOrderStatus(value: unknown): value is OrderStatus;
export function isExportableOrderStatus(value: unknown): boolean;

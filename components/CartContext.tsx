"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "@/lib/data";
import { MAX_QTY } from "@/lib/data";

export type CartItem = {
  productId: string;
  color: string;
  size: string;
  qty: number;
};

type CartContextValue = {
  items: CartItem[];
  ready: boolean;
  count: number;
  addItem: (item: CartItem) => void;
  updateQty: (key: string, qty: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  keyOf: (item: CartItem) => string;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "fasrod-cart-v1";

export const cartKey = (item: CartItem) =>
  `${item.productId}::${item.color}::${item.size}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(
            parsed.filter(
              (item): item is CartItem =>
                item &&
                typeof item.productId === "string" &&
                typeof item.color === "string" &&
                typeof item.size === "string" &&
                Number.isInteger(item.qty) &&
                item.qty >= 1 &&
                item.qty <= MAX_QTY
            )
          );
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, ready]);

  const addItem = useCallback((incoming: CartItem) => {
    setItems((current) => {
      const key = cartKey(incoming);
      const found = current.find((item) => cartKey(item) === key);

      if (found) {
        return current.map((item) =>
          cartKey(item) === key
            ? { ...item, qty: Math.min(MAX_QTY, item.qty + incoming.qty) }
            : item
        );
      }

      return [...current, { ...incoming, qty: Math.min(MAX_QTY, incoming.qty) }];
    });
  }, []);

  const updateQty = useCallback((key: string, qty: number) => {
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return;

    setItems((current) =>
      current.map((item) =>
        cartKey(item) === key ? { ...item, qty } : item
      )
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((current) => current.filter((item) => cartKey(item) !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(
    () => items.reduce((sum, item) => sum + item.qty, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        ready,
        count,
        addItem,
        updateQty,
        removeItem,
        clear,
        keyOf: cartKey,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) {
    throw new Error("useCart doit être utilisé dans CartProvider.");
  }
  return value;
}

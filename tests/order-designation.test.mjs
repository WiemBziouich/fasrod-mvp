import test from "node:test";
import assert from "node:assert/strict";
import { formatOrderDesignation } from "../lib/order-designation.mjs";

test("formats each ordered piece as a separate designation", () => {
  assert.equal(
    formatOrderDesignation([
      {
        productName: "Baggy jogger",
        color: "Noir",
        size: "M",
        qty: 1,
      },
      {
        productName: "Fasrod hoodie",
        color: "Rose",
        size: "L",
        qty: 2,
      },
    ]),
    "Baggy jogger - Noir - M + Fasrod hoodie - Rose - L + Fasrod hoodie - Rose - L"
  );
});

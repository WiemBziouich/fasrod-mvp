import test from "node:test";
import assert from "node:assert/strict";
import {
  basketsMatch,
  isExportableOrderStatus,
  isOrderStatus,
  normalizeBasket,
  normalizeTunisiaPhone,
} from "../lib/duplicate-orders.mjs";

const basketA = [
  { product_id: "baggy-noir", color: "Noir", size: "M", qty: 1 },
  { product_id: "camo-baggy", color: "Beige", size: "L", qty: 2 },
];

test("normalizes Tunisian phone prefixes and formatted digits", () => {
  assert.equal(normalizeTunisiaPhone("+216 12-345-678"), "12345678");
  assert.equal(normalizeTunisiaPhone("00216 (12) 345 678"), "12345678");
  assert.equal(normalizeTunisiaPhone("21612345678"), "12345678");
  assert.equal(normalizeTunisiaPhone("21612345"), "21612345");
  assert.equal(normalizeTunisiaPhone("١٢٣٤٥٦٧٨"), "12345678");
  assert.equal(normalizeTunisiaPhone("1234567"), null);
  assert.equal(normalizeTunisiaPhone("12abc345678"), null);
});

test("basket comparison sorts exact product, color, size, and quantity tuples", () => {
  assert.equal(
    basketsMatch(basketA, [...basketA].reverse()),
    true
  );
  assert.equal(
    basketsMatch(basketA, [
      ...basketA.slice(0, 1),
      { ...basketA[1], qty: 1 },
    ]),
    false
  );
  assert.equal(
    basketsMatch(basketA, [
      { ...basketA[0], color: "Noir " },
      basketA[1],
    ]),
    false
  );
  assert.equal(normalizeBasket([]), null);
});

test("validates review statuses and only exports normal or confirmed-new orders", () => {
  for (const status of [
    "normal",
    "pending_review",
    "confirmed_new",
    "confirmed_duplicate",
  ]) {
    assert.equal(isOrderStatus(status), true);
  }
  assert.equal(isOrderStatus("deleted"), false);
  assert.equal(isExportableOrderStatus("normal"), true);
  assert.equal(isExportableOrderStatus("confirmed_new"), true);
  assert.equal(isExportableOrderStatus("pending_review"), false);
  assert.equal(isExportableOrderStatus("confirmed_duplicate"), false);
});

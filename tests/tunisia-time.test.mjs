import test from "node:test";
import assert from "node:assert/strict";
import {
  formatTunisiaDateTime,
  shouldCallCustomerToday,
} from "../lib/tunisia-time.mjs";

test("formats SQLite UTC timestamps in Tunisia time", () => {
  assert.match(formatTunisiaDateTime("2026-11-09 16:58:00"), /17:58:00/);
  assert.match(formatTunisiaDateTime("2026-11-09T16:58:00Z"), /17:58:00/);
  assert.equal(formatTunisiaDateTime("invalid timestamp"), "invalid timestamp");
});

test("uses 16:00 Tunisia time as the call-day cutoff", () => {
  assert.equal(
    shouldCallCustomerToday(new Date("2026-11-09T14:59:00Z")),
    true
  );
  assert.equal(
    shouldCallCustomerToday(new Date("2026-11-09T15:00:00Z")),
    false
  );
  assert.equal(
    shouldCallCustomerToday(new Date("2026-11-09T07:59:00Z")),
    false
  );
});

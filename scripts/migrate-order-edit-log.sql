CREATE TABLE IF NOT EXISTS order_edit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  edited_at TEXT NOT NULL DEFAULT (datetime('now')),
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL
);

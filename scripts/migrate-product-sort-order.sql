ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE products SET sort_order = (SELECT display_position * 10 FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY rowid) AS display_position FROM products) AS ordered_products WHERE ordered_products.id = products.id) WHERE sort_order = 0;

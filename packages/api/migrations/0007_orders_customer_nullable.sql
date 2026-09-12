-- Story 16.5: Relax orders.customer_id FK from CASCADE to SET NULL
-- so that hard-purging a customer row nullifies their orders instead of cascading deletes.
-- GDPR Recital 26: anonymized billing rows are out of scope as personal data.
-- @pg-mem-skip: ALTER TABLE DROP CONSTRAINT is not supported by pg-mem; this migration runs on real Postgres only.

ALTER TABLE orders ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE orders DROP CONSTRAINT orders_customer_id_fkey;

ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

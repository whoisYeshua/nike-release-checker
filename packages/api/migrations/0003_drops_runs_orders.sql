-- =============================================================================
-- Migration : 0003_drops_runs_orders.sql
-- Story     : 16.1 Multi-Tenant Postgres Schema
-- Tables    : drops, drop_runs, orders
-- Cascade   : drops      -> customers  (ON DELETE CASCADE)
--             drop_runs  -> drops      (ON DELETE CASCADE)
--             drop_runs  -> customers  (ON DELETE CASCADE, denormalized)
--             drop_runs  -> nike_accounts (ON DELETE RESTRICT)
--             orders     -> drop_runs  (ON DELETE CASCADE)
--             orders     -> customers  (ON DELETE CASCADE, denormalized)
-- ASCII     : customers
--                └── drops
--                       └── drop_runs  <──── nike_accounts (RESTRICT)
--                              └── orders
-- =============================================================================

-- ---------------------------------------------------------------------------
-- drops
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drops (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  country           TEXT        NOT NULL,
  sku               TEXT        NOT NULL,
  sizes_json        JSONB       NOT NULL,
  max_accounts      INTEGER     NOT NULL CHECK (max_accounts BETWEEN 1 AND 500),
  payment_method_id TEXT,
  scheduled_at      TIMESTAMPTZ,
  state             TEXT        NOT NULL DEFAULT 'DRAFT'
                                CHECK (state IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS drops_customer_id_idx ON drops(customer_id);
CREATE INDEX IF NOT EXISTS drops_state_idx       ON drops(state) WHERE state IN ('SCHEDULED', 'ACTIVE');

-- ---------------------------------------------------------------------------
-- drop_runs  (one row per nike_account attempt per drop)
-- customer_id is denormalized for uniform tenant-scoped queries and future RLS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drop_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id         UUID        NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  nike_account_id UUID        NOT NULL REFERENCES nike_accounts(id) ON DELETE RESTRICT,
  state           TEXT        NOT NULL DEFAULT 'PENDING',
  order_number    TEXT,
  error_reason    TEXT,
  retry_attempt   INTEGER     NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS drop_runs_drop_id_idx     ON drop_runs(drop_id);
CREATE INDEX IF NOT EXISTS drop_runs_customer_id_idx ON drop_runs(customer_id);

-- ---------------------------------------------------------------------------
-- orders  (confirmed Nike orders, one per drop_run)
-- customer_id denormalized (same rationale as drop_runs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_run_id         UUID        NOT NULL REFERENCES drop_runs(id) ON DELETE CASCADE,
  customer_id         UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  nike_order_number   TEXT        NOT NULL UNIQUE,
  total_amount_cents  INTEGER     NOT NULL,
  currency            TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'confirmed',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_id_created_at_idx ON orders(customer_id, created_at DESC);

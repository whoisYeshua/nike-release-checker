-- =============================================================================
-- Migration : 0004_webhooks_and_audit.sql
-- Story     : 16.1 Multi-Tenant Postgres Schema  (webhook design from Story 15.5)
-- Tables    : webhooks, webhook_deliveries, audit_log
-- Cascade   : webhooks            -> customers (ON DELETE CASCADE)
--             webhook_deliveries  -> webhooks  (ON DELETE CASCADE)
--             webhook_deliveries  -> customers (ON DELETE CASCADE, denormalized)
--             audit_log.customer_id is NULLABLE; ON DELETE SET NULL keeps audit history
-- ASCII     : customers
--                ├── webhooks
--                │      └── webhook_deliveries
--                └── audit_log  (customer_id nullable, SET NULL on delete)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- webhooks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhooks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  url               TEXT        NOT NULL,
  secret_encrypted  BYTEA       NOT NULL,   -- webhook signing secret, encrypted (Story 16.2)
  events_subscribed TEXT[]      NOT NULL DEFAULT '{}',
  active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhooks_customer_id_idx ON webhooks(customer_id);

-- ---------------------------------------------------------------------------
-- webhook_deliveries  (outbox — worker polls next_retry_at <= now)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID        NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  payload_json  JSONB       NOT NULL,
  http_status   INTEGER,
  attempt_count INTEGER     NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_customer_id_idx  ON webhook_deliveries(customer_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_next_retry_at_idx
  ON webhook_deliveries(next_retry_at)
  WHERE delivered_at IS NULL AND (http_status IS NULL OR http_status != -1);

-- ---------------------------------------------------------------------------
-- audit_log  (NFR39 — 12-month retention; customer_id NULLABLE for system events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id                    BIGSERIAL   PRIMARY KEY,
  customer_id           UUID        REFERENCES customers(id) ON DELETE SET NULL,
  actor                 TEXT,                    -- api_key_id or 'system'
  action                TEXT        NOT NULL,    -- 'drop.create', 'drop.run', 'customer.delete'
  resource_type         TEXT        NOT NULL,
  resource_id           TEXT,
  payload_redacted_json JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_customer_created_idx ON audit_log(customer_id, created_at DESC);

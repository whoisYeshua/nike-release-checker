-- =============================================================================
-- Migration : 0001_customers_and_api_keys.sql
-- Story     : 16.1 Multi-Tenant Postgres Schema
-- Tables    : customers, api_keys
-- Cascade   : api_keys -> customers (ON DELETE CASCADE)
-- ASCII     : customers
--                └── api_keys
-- =============================================================================

-- Idempotency: each statement is guarded by IF NOT EXISTS / DO NOTHING patterns.

-- Required extension for UUID generation and pgcrypto functions (Story 16.2 AES)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- citext provides case-insensitive TEXT comparison for email lookups
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                CITEXT      NOT NULL UNIQUE,
  stripe_customer_id   TEXT        UNIQUE,
  tier                 TEXT        NOT NULL DEFAULT 'solo'
                                   CHECK (tier IN ('solo', 'pro', 'enterprise')),
  dek_wrapped          BYTEA       NOT NULL DEFAULT '',    -- KMS-wrapped per-customer DEK (Story 16.2); empty default allows row creation before KMS wired
  default_currency     TEXT        NOT NULL DEFAULT 'USD',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- api_keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  key_id        TEXT        PRIMARY KEY,
  customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  secret_hash   TEXT        NOT NULL,
  label         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_keys_customer_id_idx ON api_keys(customer_id);

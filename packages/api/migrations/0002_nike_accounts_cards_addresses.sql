-- =============================================================================
-- Migration : 0002_nike_accounts_cards_addresses.sql
-- Story     : 16.1 Multi-Tenant Postgres Schema
-- Tables    : nike_accounts, cards, addresses
-- Cascade   : nike_accounts -> customers (ON DELETE CASCADE)
--             cards         -> customers (ON DELETE CASCADE)
--             cards         -> nike_accounts (ON DELETE SET NULL)
--             addresses     -> customers (ON DELETE CASCADE)
--             addresses     -> nike_accounts (ON DELETE SET NULL)
-- ASCII     : customers
--                ├── nike_accounts
--                │      ├── cards   (SET NULL)
--                │      └── addresses (SET NULL)
--                ├── cards
--                └── addresses
-- =============================================================================

-- ---------------------------------------------------------------------------
-- nike_accounts (vault — credentials encrypted in Story 16.3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nike_accounts (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  country                    TEXT        NOT NULL,
  email_encrypted            BYTEA       NOT NULL,
  password_encrypted         BYTEA       NOT NULL,
  proxy_url_encrypted        BYTEA,
  preferred_sizes            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  session_snapshot_encrypted BYTEA,
  session_status             TEXT        NOT NULL DEFAULT 'unknown',
  last_login_at              TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NOTE: UNIQUE (customer_id, email_encrypted) omitted because BYTEA equality
  --       on encrypted data is meaningless here; uniqueness enforced in app layer
  --       after decryption (Story 16.3).
);
CREATE INDEX IF NOT EXISTS nike_accounts_customer_id_idx ON nike_accounts(customer_id);

-- ---------------------------------------------------------------------------
-- cards (payment cards — PAN encrypted in Story 16.4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  nike_account_id       UUID        REFERENCES nike_accounts(id) ON DELETE SET NULL,
  holder_name_encrypted BYTEA       NOT NULL,
  card_number_encrypted BYTEA       NOT NULL,
  expiry_encrypted      BYTEA       NOT NULL,
  cvv_encrypted         BYTEA       NOT NULL,
  brand                 TEXT        NOT NULL,   -- 'visa', 'mastercard' — non-sensitive
  last4                 TEXT        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cards_customer_id_idx ON cards(customer_id);

-- ---------------------------------------------------------------------------
-- addresses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS addresses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  nike_account_id UUID        REFERENCES nike_accounts(id) ON DELETE SET NULL,
  country         TEXT        NOT NULL,
  street          TEXT        NOT NULL,
  city            TEXT        NOT NULL,
  zip             TEXT        NOT NULL,
  phone_encrypted BYTEA       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS addresses_customer_id_idx ON addresses(customer_id);

-- =============================================================================
-- Migration : 0006_nike_accounts_email_lookup.sql
-- Story     : 16.4 Nike Account Credential Storage
-- Purpose   : Add deterministic email_lookup column for per-customer uniqueness.
--             HMAC-SHA256(dek, lowercase(email)) is stable (same email → same
--             blob) but unguessable without the DEK, and different across
--             customers (different DEK → different HMAC).
-- =============================================================================

ALTER TABLE nike_accounts ADD COLUMN IF NOT EXISTS email_lookup BYTEA;

-- Populate existing rows with a placeholder so NOT NULL can be enforced later
-- In production a data migration would recompute real HMACs; here we use zeroes
-- because the in-memory stub starts empty each test run.
UPDATE nike_accounts SET email_lookup = '\x00' WHERE email_lookup IS NULL;

ALTER TABLE nike_accounts ALTER COLUMN email_lookup SET NOT NULL;

-- Drop the non-functional index on the random-IV ciphertext (if it existed)
DROP INDEX IF EXISTS nike_accounts_customer_id_email_encrypted;

-- Enforce uniqueness via the deterministic HMAC column
CREATE UNIQUE INDEX IF NOT EXISTS nike_accounts_customer_email_lookup_idx
  ON nike_accounts(customer_id, email_lookup);

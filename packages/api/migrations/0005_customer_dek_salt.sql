-- =============================================================================
-- Migration : 0005_customer_dek_salt.sql
-- Story     : 16.2 Per-Customer KMS Key (HKDF DEK derivation)
-- Adds      : customers.dek_salt — per-customer 32-byte random salt for HKDF
-- =============================================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS dek_salt BYTEA NOT NULL DEFAULT '\x00';
-- For pre-existing rows in dev DBs: backfill is handled by the provision script
-- (no production data yet at this migration point)
ALTER TABLE customers ALTER COLUMN dek_salt DROP DEFAULT;

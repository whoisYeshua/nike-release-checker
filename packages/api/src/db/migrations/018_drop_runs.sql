-- Migration 018: Per-account drop run rows with worker lease + retry (Story 17.3)
-- Depends on: 017_drops.sql (drops table), 016_customers.sql, 015_nike_accounts.sql

CREATE TYPE drop_run_state AS ENUM (
  'WAITING', 'COPPING', 'COP', 'FAIL', 'SKIPPED'
);

CREATE TABLE drop_runs (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id             UUID          NOT NULL REFERENCES drops(id),
  nike_account_id     UUID          NOT NULL REFERENCES nike_accounts(id),
  customer_id         UUID          NOT NULL REFERENCES customers(id),
  state               drop_run_state NOT NULL DEFAULT 'WAITING',
  attempt             SMALLINT      NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 3),
  worker_id           TEXT,
  leased_at           TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  order_number        TEXT,
  error_reason        TEXT,
  error_classification TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_drop_runs_lease ON drop_runs(state, created_at) WHERE state = 'WAITING';
CREATE INDEX idx_drop_runs_reap ON drop_runs(state, leased_at) WHERE state = 'COPPING';
CREATE INDEX idx_drop_runs_drop ON drop_runs(drop_id);
CREATE UNIQUE INDEX idx_drop_runs_unique_attempt
  ON drop_runs(drop_id, nike_account_id, attempt);

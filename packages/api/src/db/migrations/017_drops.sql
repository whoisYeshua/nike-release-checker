-- Migration 017: Drop entity + lifecycle state machine (Story 17.1)
-- Depends on: 016_customers.sql (customers table)

CREATE TYPE drop_state AS ENUM (
  'DRAFT', 'SCHEDULED', 'ARMED', 'ACTIVE',
  'COMPLETED', 'CANCELLED', 'ARCHIVED'
);

CREATE TABLE drops (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID        NOT NULL REFERENCES customers(id),
  sku            TEXT        NOT NULL,
  country        CHAR(2)     NOT NULL,
  sizes          TEXT[]      NOT NULL,
  accounts_filter JSONB      NOT NULL DEFAULT '{}',
  fire_at        TIMESTAMPTZ,
  state          drop_state  NOT NULL DEFAULT 'DRAFT',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (state IN ('DRAFT','SCHEDULED','ARMED','ACTIVE','COMPLETED','CANCELLED','ARCHIVED'))
);

CREATE INDEX idx_drops_customer_state ON drops(customer_id, state);
CREATE INDEX idx_drops_scheduler ON drops(state, fire_at)
  WHERE state IN ('SCHEDULED','ARMED');

-- Immutable audit trail (NFR39: 12-month retention)
-- Application role MUST NOT have DELETE or UPDATE privileges on this table.
CREATE TABLE drop_state_audit (
  id           BIGSERIAL    PRIMARY KEY,
  drop_id      UUID         NOT NULL REFERENCES drops(id),
  from_state   drop_state,
  to_state     drop_state   NOT NULL,
  actor        TEXT         NOT NULL,
  reason       TEXT,
  occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_drop_audit_drop ON drop_state_audit(drop_id, occurred_at);

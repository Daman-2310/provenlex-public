-- =============================================================================
-- GENESIS SWARM — AUTONOMOUS FINANCIAL CLEARING MATRIX · PostgreSQL DDL
-- Core tracking tables for the three deep-tech layers. Each layer group can be
-- deployed to an independent database inside its own microservice container.
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- LAYER 1 — Programmatic Escrow Circuit Breaker
-- =============================================================================

create table if not exists active_escrow_holds (
    hold_id              text primary key,                     -- on-chain holdId (keccak)
    token_address        text not null default '0x0',          -- 0x0 == native
    sender_address       text not null,
    beneficiary_address  text not null,
    amount_eur           numeric(24,2) not null check (amount_eur > 0),
    adds_exposure_eur    numeric(24,2) not null default 0,
    fund_id              text not null,
    fund_structure       text not null check (fund_structure in ('open_ended','closed_ended')),
    status               text not null default 'held'
                            check (status in ('held','released','locked')),
    breach_codes         text[] not null default '{}',
    compliance_ref       char(66) not null,                    -- 0x + 64 hex
    tx_hash              char(66),                             -- resolution tx
    created_at           timestamptz not null default now(),
    resolved_at          timestamptz
);
create index if not exists ix_escrow_status on active_escrow_holds(status, created_at desc);
create index if not exists ix_escrow_fund   on active_escrow_holds(fund_id);

create table if not exists escrow_consensus_approvals (
    hold_id              text not null references active_escrow_holds(hold_id) on delete cascade,
    signer_address       text not null,
    approved_at          timestamptz not null default now(),
    primary key (hold_id, signer_address)
);

-- =============================================================================
-- LAYER 2 — Recursive Proof-of-Substance Verifier Ring
-- =============================================================================

create table if not exists node_verifier_ring_registry (
    node_id              uuid primary key default gen_random_uuid(),
    role                 text not null unique
                            check (role in ('custodian_bank','fund_administrator','auditor')),
    public_key           text not null,                        -- aggregate-group pubkey (hex)
    endpoint_url         text,
    active               boolean not null default true,
    registered_at        timestamptz not null default now()
);

create table if not exists proof_of_substance_log (
    id                   uuid primary key default gen_random_uuid(),
    director_id          text not null,
    sub_fund_id          text not null,
    lat                  numeric(9,6) not null,
    lon                  numeric(9,6) not null,
    device_hwid_digest   char(64) not null,                    -- SHA-256, never raw HWID
    message_hash         text not null,
    finalized            boolean not null,
    fraudulent           boolean not null,
    aggregate_signature  text,
    aggregate_pubkey     text,
    aggregate_valid      boolean not null default false,
    anchored_ref         char(66),
    evaluated_at         timestamptz not null default now()
);
create index if not exists ix_pos_director on proof_of_substance_log(director_id);
create index if not exists ix_pos_finalized on proof_of_substance_log(finalized, evaluated_at desc);

create table if not exists proof_validator_attestations (
    id                   uuid primary key default gen_random_uuid(),
    proof_id             uuid not null references proof_of_substance_log(id) on delete cascade,
    role                 text not null check (role in ('custodian_bank','fund_administrator','auditor')),
    passed               boolean not null,
    reason               text not null
);

-- =============================================================================
-- LAYER 3 — Homomorphic Dark-Pool Exposure Moat
-- =============================================================================
-- NB: ciphertexts are large integers; stored as TEXT (base-10) to avoid numeric
-- precision limits. The server persists ONLY ciphertext + digests, never plaintext.

create table if not exists encrypted_telemetry_ingress_log (
    id                          uuid primary key default gen_random_uuid(),
    tenant_id                   text not null,
    n_positions                 integer not null check (n_positions > 0),
    encrypted_total_ciphertext  text not null,                 -- Paillier ciphertext (base-10)
    encrypted_velocity          text,                          -- nullable ciphertext
    breach_indicator_ciphertext text not null,
    total_ct_digest             text not null,                 -- low-64-bit hex digest for indexing
    paillier_n_bits             integer not null,
    evaluated_at                timestamptz not null default now()
);
create index if not exists ix_telemetry_tenant on encrypted_telemetry_ingress_log(tenant_id, evaluated_at desc);

-- Public parameters per tenant key (NEVER store lambda/mu — those are private).
create table if not exists tenant_paillier_pubkeys (
    tenant_id            text primary key,
    n                    text not null,                        -- modulus (base-10)
    g                    text not null,
    n_bits               integer not null,
    created_at           timestamptz not null default now()
);

-- =============================================================================
-- END OF DDL
-- =============================================================================

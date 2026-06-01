-- =============================================================================
-- GENESIS SWARM — LUXEMBOURG REGTECH SUITE · PostgreSQL DDL
-- Core tables for all five components. Each component group can be deployed to
-- an independent database when split into microservices.
--
-- Conventions:
--   * UUID primary keys (gen_random_uuid from pgcrypto)
--   * timestamptz everywhere, UTC
--   * hash-chain tables carry prev_hash + entry_hash for tamper evidence
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- COMPONENT 1 — Substance Audit Engine (CSSF 24/856)
-- =============================================================================

create table if not exists substance_directors (
    director_id        text primary key,
    director_name      text not null,
    role               text not null default 'independent_director'
                         check (role in ('independent_director','compliance_officer','conducting_officer')),
    created_at         timestamptz not null default now()
);

-- Append-only, hash-chained sign-off log.
create table if not exists substance_audit_log (
    id                 uuid primary key default gen_random_uuid(),
    chain_index        bigint not null,
    director_id        text not null references substance_directors(director_id),
    sub_fund_id        text not null,
    action_type        text not null
                         check (action_type in ('board_vote','nav_sign_off','risk_sign_off',
                                                'delegation_review','general')),
    active_hours       numeric(6,2) not null check (active_hours >= 0 and active_hours <= 24),
    location_country   char(2),
    location_lat       numeric(9,6),
    location_lon       numeric(9,6),
    geofence_pass      boolean not null,
    geofence_method    text not null,
    occurred_at        timestamptz not null,
    prev_hash          char(64) not null,
    entry_hash         char(64) not null unique,
    created_at         timestamptz not null default now()
);
create index if not exists ix_substance_log_director on substance_audit_log(director_id);
create index if not exists ix_substance_log_subfund  on substance_audit_log(sub_fund_id);
create unique index if not exists ux_substance_chain  on substance_audit_log(chain_index);

-- Materialised aggregate for fast threshold checks (refresh on insert/trigger).
create table if not exists substance_director_stats (
    director_id        text primary key references substance_directors(director_id),
    total_actions      integer not null default 0,
    total_active_hours numeric(10,2) not null default 0,
    local_actions      integer not null default 0,
    updated_at         timestamptz not null default now()
);

-- =============================================================================
-- COMPONENT 2 — Cross-Departmental Discrepancy Engine
-- =============================================================================

create table if not exists reconciliation_runs (
    id                 uuid primary key default gen_random_uuid(),
    fund_id            text not null,
    reconciled_at      timestamptz not null default now(),
    clean              boolean not null,
    max_severity       text not null check (max_severity in ('none','info','warning','critical')),
    reported_nav_eur   numeric(20,2),
    summed_assets_eur  numeric(20,2),
    nav_gap_pct        numeric(10,4),
    liquidity_coverage numeric(12,6)
);
create index if not exists ix_recon_fund on reconciliation_runs(fund_id, reconciled_at desc);

create table if not exists reconciliation_discrepancies (
    id                 uuid primary key default gen_random_uuid(),
    run_id             uuid not null references reconciliation_runs(id) on delete cascade,
    code               text not null,
    severity           text not null check (severity in ('info','warning','critical')),
    detail             text not null,
    observed           numeric(20,6),
    threshold          numeric(20,6)
);
create index if not exists ix_discrepancy_run on reconciliation_discrepancies(run_id);

-- =============================================================================
-- COMPONENT 3 — AIFMD II Arbitrage & Limit Monitor
-- =============================================================================

create table if not exists aifmd_funds (
    fund_id            text primary key,
    structure          text not null check (structure in ('open_ended','closed_ended')),
    nav_eur            numeric(20,2) not null check (nav_eur > 0),
    gross_exposure_eur numeric(20,2) not null default 0,
    updated_at         timestamptz not null default now()
);

create table if not exists aifmd_borrower_exposures (
    fund_id            text not null references aifmd_funds(fund_id) on delete cascade,
    borrower_id        text not null,
    borrower_type      text not null
                         check (borrower_type in ('financial_institution','corporate','sovereign','other')),
    exposure_eur       numeric(20,2) not null default 0,
    primary key (fund_id, borrower_id)
);

create table if not exists aifmd_trade_simulations (
    id                 uuid primary key default gen_random_uuid(),
    fund_id            text not null references aifmd_funds(fund_id),
    borrower_id        text not null,
    nominal_eur        numeric(20,2) not null,
    retained_eur       numeric(20,2) not null,
    added_exposure_eur numeric(20,2) not null,
    allowed            boolean not null,
    post_leverage_pct  numeric(10,4),
    blocking_rules     text[] not null default '{}',
    simulated_at       timestamptz not null default now()
);
create index if not exists ix_aifmd_sim_fund on aifmd_trade_simulations(fund_id, simulated_at desc);

-- =============================================================================
-- COMPONENT 4 — CSSF e-Identification Pipeline
-- =============================================================================

create table if not exists eid_submissions (
    submission_id      uuid primary key default gen_random_uuid(),
    internal_fund_id   text not null,
    legal_name         text not null,
    fund_type          text not null check (fund_type in ('UCITS','RAIF','SIF','SICAR','PART_II_UCI')),
    document_sha256    char(64) not null,
    preflight_valid    boolean not null,
    status             text not null
                         check (status in ('QUEUED','TRANSMITTING','ACCEPTED','REJECTED','ERROR')),
    cssf_code          text,
    cssf_message       text,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create index if not exists ix_eid_status on eid_submissions(status, created_at desc);

create table if not exists eid_preflight_findings (
    id                 uuid primary key default gen_random_uuid(),
    submission_id      uuid not null references eid_submissions(submission_id) on delete cascade,
    field              text not null,
    ok                 boolean not null,
    message            text not null
);

-- =============================================================================
-- COMPONENT 5 — Delegation Oversight Ledger (CSSF 18/698)
-- =============================================================================

create table if not exists delegates (
    delegate_id        text primary key,
    name               text not null,
    category           text not null
                         check (category in ('fund_administrator','custodian','it_vendor',
                                             'transfer_agent','portfolio_manager')),
    is_critical        boolean not null default false,
    created_at         timestamptz not null default now()
);

create table if not exists delegate_risk_scores (
    id                 uuid primary key default gen_random_uuid(),
    delegate_id        text not null references delegates(delegate_id) on delete cascade,
    score              numeric(5,2) not null check (score >= 0 and score <= 100),
    healthy            boolean not null,
    breached_threshold numeric(5,2) not null,
    drivers            jsonb not null,
    scored_at          timestamptz not null default now()
);
create index if not exists ix_risk_delegate on delegate_risk_scores(delegate_id, scored_at desc);

-- Unalterable, hash-chained Board oversight ledger (legal-defence log).
create table if not exists delegation_oversight_ledger (
    id                 uuid primary key default gen_random_uuid(),
    chain_index        bigint not null,
    delegate_id        text not null references delegates(delegate_id),
    delegate_name      text not null,
    action_type        text not null
                         check (action_type in ('initial_due_diligence','periodic_review',
                                                'risk_adjustment','incident_review',
                                                'sla_breach_review','termination_decision')),
    board_member       text not null,
    notes              text not null default '',
    risk_score_at_action numeric(5,2),
    prev_hash          char(64) not null,
    entry_hash         char(64) not null unique,
    created_at         timestamptz not null default now()
);
create unique index if not exists ux_oversight_chain on delegation_oversight_ledger(chain_index);
create index if not exists ix_oversight_delegate on delegation_oversight_ledger(delegate_id);

create table if not exists delegation_workflows (
    workflow_id        text primary key,
    delegate_id        text not null references delegates(delegate_id),
    delegate_name      text not null,
    score              numeric(5,2) not null,
    threshold          numeric(5,2) not null,
    severity           text not null check (severity in ('elevated','critical')),
    required_steps     text[] not null,
    status             text not null default 'open' check (status in ('open','in_progress','closed')),
    opened_at          timestamptz not null default now(),
    closed_at          timestamptz
);
create index if not exists ix_workflow_delegate on delegation_workflows(delegate_id, status);

-- =============================================================================
-- END OF DDL
-- =============================================================================

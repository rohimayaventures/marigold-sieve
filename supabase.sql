-- Optional: run in the Supabase SQL editor to enable deployed logging.
create table if not exists public.compliance_runs (
  id bigint generated always as identity primary key,
  time timestamptz not null default now(),
  kind text not null,
  status text,
  model_used text,
  routed_to_strong boolean,
  confidence numeric,
  issue_count int,
  input_tokens int,
  output_tokens int,
  cost_usd numeric,
  latency_ms int,
  mock boolean default false
);
alter table public.compliance_runs enable row level security;
-- No policies: only the service key (used by the Worker as a secret) can insert or read.

-- Academy OS · 0010 Kaizen billing (2026-10-23). Run in Nevorai OS SQL editor. Safe to run again.
-- Nevorai's own plan billing happens ONLY at billing.nevorai.com (Kaizen). Kaizen calls
-- /api/kaizen/provision | suspend | resume | cancel; these two tables remember what it told us
-- (one row per Kaizen subscription, so a repeated call never makes a second academy) and log each call.
-- Service role only: a signed-in owner, coach or parent can neither read nor write them.
begin;

create table if not exists academy.kaizen_subscriptions (
  kaizen_subscription_id text primary key,
  tenant_id uuid not null references academy.tenants(id) on delete cascade,
  plan_key text not null,
  state text not null default 'active' check (state in ('active', 'suspended', 'cancelled')),
  -- true when billing itself switched the academy off (so "resume" never undoes a pause a person made by hand)
  paused_by_billing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kaizen_subscriptions_tenant_idx on academy.kaizen_subscriptions (tenant_id);

create table if not exists academy.kaizen_events (
  id bigserial primary key,
  kaizen_subscription_id text,
  action text not null,
  ok boolean not null,
  code text,
  tenant_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists kaizen_events_created_idx on academy.kaizen_events (created_at desc);

alter table academy.kaizen_subscriptions enable row level security;
alter table academy.kaizen_events enable row level security;
revoke all on academy.kaizen_subscriptions, academy.kaizen_events from public, anon, authenticated;
revoke all on sequence academy.kaizen_events_id_seq from public, anon, authenticated;
grant all on academy.kaizen_subscriptions, academy.kaizen_events to service_role;
grant all on sequence academy.kaizen_events_id_seq to service_role;

insert into platform.app_migrations (app_key, version) values ('academy', 'academy_0010_kaizen_billing') on conflict do nothing;

commit;

-- Proof. Expect: two rows, tables_exist true, anon_can_read false, authenticated_can_read false.
select
  to_regclass('academy.kaizen_subscriptions') is not null and to_regclass('academy.kaizen_events') is not null as tables_exist,
  has_table_privilege('anon', 'academy.kaizen_subscriptions', 'select') as anon_can_read,
  has_table_privilege('authenticated', 'academy.kaizen_subscriptions', 'select') as authenticated_can_read;

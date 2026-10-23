-- Academy OS · 0011 per-academy monthly caps on WhatsApp, e-mail and AI (2026-10-23). Run in Nevorai OS SQL editor. Safe to run again.
-- Every academy has a monthly allowance per kind (set by its plan, adjustable per academy). The server asks
-- academy.consume_usage(...) BEFORE it sends; the answer is yes (and the counter moves) or no (nothing is sent).
-- One atomic statement, so two sends at once can never pass the cap together. Months follow Indian time.
begin;

create table if not exists academy.usage_counters (
  tenant_id uuid not null references academy.tenants(id) on delete cascade,
  kind text not null check (kind in ('whatsapp', 'email', 'ai')),
  period text not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, kind, period)
);

alter table academy.usage_counters enable row level security;
revoke all on academy.usage_counters from public, anon, authenticated;
grant select on academy.usage_counters to authenticated;
grant all on academy.usage_counters to service_role;
-- An owner (or platform admin) may READ their own academy's counters to show "used / allowed"; nobody can write them.
drop policy if exists usage_counters_owner_read on academy.usage_counters;
create policy usage_counters_owner_read on academy.usage_counters for select to authenticated
  using (academy.is_tenant_owner(auth.uid(), tenant_id) or academy.is_platform_admin(auth.uid()));

create or replace function academy.consume_usage(_tenant uuid, _kind text, _n integer, _cap integer)
returns boolean
language plpgsql
security definer
set search_path = academy, pg_temp
as $$
declare
  _period text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM');
  _used integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if _n is null or _n < 1 then return true; end if;
  if _cap is null then
    insert into academy.usage_counters (tenant_id, kind, period, used) values (_tenant, _kind, _period, _n)
    on conflict (tenant_id, kind, period) do update set used = academy.usage_counters.used + _n, updated_at = now();
    return true;
  end if;
  if _n > _cap then return false; end if;
  insert into academy.usage_counters (tenant_id, kind, period, used) values (_tenant, _kind, _period, _n)
  on conflict (tenant_id, kind, period) do update set used = academy.usage_counters.used + _n, updated_at = now()
    where academy.usage_counters.used + _n <= _cap
  returning used into _used;
  return _used is not null;
end;
$$;
revoke all on function academy.consume_usage(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function academy.consume_usage(uuid, text, integer, integer) to service_role;

insert into platform.app_migrations (app_key, version) values ('academy', 'academy_0011_usage_caps') on conflict do nothing;

commit;

-- Proof. Expect: anon_can_run false, authenticated_can_run false, service_role_can_run true, anon_can_write false.
select
  has_function_privilege('anon', 'academy.consume_usage(uuid,text,integer,integer)', 'execute') as anon_can_run,
  has_function_privilege('authenticated', 'academy.consume_usage(uuid,text,integer,integer)', 'execute') as authenticated_can_run,
  has_function_privilege('service_role', 'academy.consume_usage(uuid,text,integer,integer)', 'execute') as service_role_can_run,
  has_table_privilege('authenticated', 'academy.usage_counters', 'insert') as anon_can_write;

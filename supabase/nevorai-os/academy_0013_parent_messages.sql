-- Academy OS 0013: automatic WhatsApp messages to parents through Nevorai Connect.
-- Run in the Nevorai OS SQL editor (project: Nevorai OS). Safe to run again.
-- The Connect API key is stored per academy by Nevorai (never shown to the owner, never sent to the browser).
-- The owner only sees on/off switches (RPCs below).

create table if not exists academy.connect_links (
  tenant_id        uuid primary key references academy.tenants(id) on delete cascade,
  api_key          text,
  enabled          boolean not null default false,
  enabled_at       timestamptz,
  on_checkin       boolean not null default true,
  on_checkout      boolean not null default true,
  on_fee_reminder  boolean not null default true,
  on_fee_received  boolean not null default true,
  updated_at       timestamptz not null default now()
);
alter table academy.connect_links enable row level security;
revoke all on academy.connect_links from anon, authenticated;

create table if not exists academy.parent_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references academy.tenants(id) on delete cascade,
  student_id  uuid references academy.students(id) on delete set null,
  kind        text not null check (kind in ('checkin','checkout','fee_due','fee_received')),
  ref         text not null,
  to_phone    text not null,
  variables   jsonb not null default '[]'::jsonb,
  header_image text,
  status      text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  attempts    int not null default 0,
  error       text,
  connect_id  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (tenant_id, ref)
);
create index if not exists parent_messages_queue on academy.parent_messages (status, created_at) where status = 'queued';
create index if not exists parent_messages_tenant_recent on academy.parent_messages (tenant_id, created_at desc);
alter table academy.parent_messages enable row level security;
revoke all on academy.parent_messages from anon, authenticated;

-- Owner reads the switches (never the key).
create or replace function academy.parent_msg_settings(_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path to 'academy' as $$
declare r academy.connect_links%rowtype;
begin
  if not (academy.is_tenant_owner(auth.uid(), _tenant) or academy.is_platform_admin(auth.uid())) then
    raise exception 'not allowed';
  end if;
  select * into r from academy.connect_links where tenant_id = _tenant;
  if not found then
    return jsonb_build_object('connected', false, 'enabled', false,
      'checkin', true, 'checkout', true, 'fee_reminder', true, 'fee_received', true);
  end if;
  return jsonb_build_object('connected', r.api_key is not null, 'enabled', r.enabled,
    'checkin', r.on_checkin, 'checkout', r.on_checkout,
    'fee_reminder', r.on_fee_reminder, 'fee_received', r.on_fee_received);
end $$;

-- Owner saves the switches. Turning ON for the first time stamps enabled_at, so old events are never sent.
create or replace function academy.parent_msg_save(
  _tenant uuid, _enabled boolean, _checkin boolean, _checkout boolean, _fee_reminder boolean, _fee_received boolean)
returns void language plpgsql security definer set search_path to 'academy' as $$
begin
  if not academy.is_tenant_owner(auth.uid(), _tenant) then raise exception 'not allowed'; end if;
  if not exists (select 1 from academy.connect_links where tenant_id = _tenant and api_key is not null) then
    raise exception 'WhatsApp is not connected yet';
  end if;
  update academy.connect_links set
    enabled = _enabled,
    enabled_at = case when _enabled and (enabled_at is null or not enabled) then now() else enabled_at end,
    on_checkin = _checkin, on_checkout = _checkout,
    on_fee_reminder = _fee_reminder, on_fee_received = _fee_received,
    updated_at = now()
  where tenant_id = _tenant;
end $$;

-- Owner sees the last messages sent (plain words, no phone numbers beyond the last 4 digits).
create or replace function academy.parent_msg_recent(_tenant uuid)
returns table (id uuid, kind text, status text, student_name text, phone_tail text, error text, created_at timestamptz)
language plpgsql stable security definer set search_path to 'academy' as $$
begin
  if not (academy.is_tenant_owner(auth.uid(), _tenant) or academy.is_platform_admin(auth.uid())) then
    raise exception 'not allowed';
  end if;
  return query
    select m.id, m.kind, m.status, s.name, right(m.to_phone, 4), m.error, m.created_at
    from academy.parent_messages m left join academy.students s on s.id = m.student_id
    where m.tenant_id = _tenant order by m.created_at desc limit 30;
end $$;

revoke all on function academy.parent_msg_settings(uuid) from public, anon;
revoke all on function academy.parent_msg_save(uuid, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function academy.parent_msg_recent(uuid) from public, anon;
grant execute on function academy.parent_msg_settings(uuid) to authenticated;
grant execute on function academy.parent_msg_save(uuid, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function academy.parent_msg_recent(uuid) to authenticated;

-- Worker: every 15 minutes (cost-guard: crons 15 min or more apart). Created PAUSED-safe: remove with cron.unschedule.
select cron.schedule('academy-parent-messages', '*/15 * * * *', $job$
  select net.http_post(url := 'https://academyos.nevorai.com/api/public/hooks/parent-messages',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'academy_cron_secret')),
    body := '{}'::jsonb) as request_id;
$job$);

-- Per academy, Nevorai connects WhatsApp once (key from Connect -> Connectors -> Developers):
--   insert into academy.connect_links (tenant_id, api_key) values ('<tenant uuid>', 'nck_...')
--   on conflict (tenant_id) do update set api_key = excluded.api_key;

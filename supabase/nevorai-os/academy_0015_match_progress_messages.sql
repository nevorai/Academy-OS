-- Academy OS 0015: two more WhatsApp messages to parents: match result and monthly attendance report.
-- Run in the Nevorai OS SQL editor after 0013 and 0014. Safe to run again.
-- Both switches start OFF, so nothing new is sent until the owner turns them on.

alter table academy.connect_links add column if not exists on_match_result boolean not null default false;
alter table academy.connect_links add column if not exists on_progress boolean not null default false;

alter table academy.parent_messages drop constraint if exists parent_messages_kind_check;
alter table academy.parent_messages add constraint parent_messages_kind_check
  check (kind in ('checkin','checkout','fee_due','fee_received','match_result','progress'));

drop function if exists academy.parent_msg_save(uuid, boolean, boolean, boolean, boolean, boolean, int);

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
      'checkin', true, 'checkout', true, 'fee_reminder', true, 'fee_received', true, 'fee_from_day', 5,
      'match_result', false, 'progress', false);
  end if;
  return jsonb_build_object('connected', r.api_key is not null, 'enabled', r.enabled,
    'checkin', r.on_checkin, 'checkout', r.on_checkout,
    'fee_reminder', r.on_fee_reminder, 'fee_received', r.on_fee_received, 'fee_from_day', r.fee_remind_from_day,
    'match_result', r.on_match_result, 'progress', r.on_progress);
end $$;

create or replace function academy.parent_msg_save(
  _tenant uuid, _enabled boolean, _checkin boolean, _checkout boolean, _fee_reminder boolean,
  _fee_received boolean, _fee_from_day int, _match_result boolean, _progress boolean)
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
    fee_remind_from_day = greatest(1, least(28, _fee_from_day)),
    on_match_result = _match_result, on_progress = _progress,
    updated_at = now()
  where tenant_id = _tenant;
end $$;

revoke all on function academy.parent_msg_settings(uuid) from public, anon;
revoke all on function academy.parent_msg_save(uuid, boolean, boolean, boolean, boolean, boolean, int, boolean, boolean) from public, anon;
grant execute on function academy.parent_msg_settings(uuid) to authenticated;
grant execute on function academy.parent_msg_save(uuid, boolean, boolean, boolean, boolean, boolean, int, boolean, boolean) to authenticated;

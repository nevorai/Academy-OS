-- academy_0012_revoke_anon_execute.sql : a signed-out visitor can no longer even CALL the staff and member functions (2026-10-25).
-- Found by the security audit: delete_student_data_v2, delete_all_archived_students_v2, bulk_approve_registrations_v2, staff_scan_student_card,
-- update_my_student_profile, mc_match_scorer_of and my_post_login_route were executable by anon. Each one already checks the caller inside and
-- refuses, so nothing was exposed; this closes the door as well (defence in depth). Signed-in people keep access. The public registration and
-- public site functions are NOT touched. Run as postgres in the Nevorai OS SQL editor. Safe to run again.
begin;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'academy' and p.prokind = 'f'
      and p.proname in ('delete_student_data_v2', 'delete_all_archived_students_v2', 'bulk_approve_registrations_v2',
                        'staff_scan_student_card', 'update_my_student_profile', 'mc_match_scorer_of', 'my_post_login_route')
  loop
    execute format('revoke all on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
  end loop;
end $$;

commit;

-- Proof: anon must be false, authenticated true, on every row.
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_run,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_run
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'academy'
  and p.proname in ('delete_student_data_v2', 'delete_all_archived_students_v2', 'bulk_approve_registrations_v2',
                    'staff_scan_student_card', 'update_my_student_profile', 'mc_match_scorer_of', 'my_post_login_route')
order by 1;

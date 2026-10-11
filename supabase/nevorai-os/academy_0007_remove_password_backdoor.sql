-- Academy OS · hardening round 2 (2026-10-11). Run in Nevorai OS. Safe to re-run.
-- admin_set_student_password wrote a new password straight into the shared login table for ANY user linked to a
-- student row (including someone who signed up on their own, and the same login can belong to another Nevorai
-- product), and a signed-out visitor held EXECUTE on it. Nothing in the app calls it any more: logins are reset
-- through the "Create logins" / "Reset login" path, which only touches logins the academy created itself.
-- So the function is removed.
begin;

DROP FUNCTION IF EXISTS academy.admin_set_student_password(uuid, uuid, text);

commit;

-- Proof: this must return 0 rows.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'academy' and proname = 'admin_set_student_password';

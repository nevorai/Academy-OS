-- Academy OS · hardening round 3 (2026-10-11). Run in Nevorai OS. Safe to re-run.
-- A new academy could be given a name like "billing" or "www" and then answer on billing.nevorai.com.
-- New tenants (and any tenant whose slug is changed) must now use a clean slug that is not one of our own
-- addresses. Existing tenants are not touched: the guard runs only on INSERT and on a slug change.
begin;

CREATE OR REPLACE FUNCTION academy.guard_tenant_slug() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'academy'
AS $$
DECLARE
  reserved text[] := ARRAY[
    'academy','academyos','www','app','api','admin','flow','billing','dash','connect','courses','media','task',
    'tasks','crm','creator','kaizen','store','mail','status','nevorai','login','signup','dashboard','platform-admin',
    'support','help','docs','static','assets','cdn','smtp','imap','pop','ftp','ns1','ns2','test','staging','dev',
    'm','match','match-center','scorer','register','apply','join','activate','auth','staff','owner'
  ];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.slug IS NOT DISTINCT FROM OLD.slug THEN
    RETURN NEW;
  END IF;
  NEW.slug := lower(btrim(NEW.slug));
  IF NEW.slug !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$' THEN
    RAISE EXCEPTION 'Academy address must be 3 to 40 letters, numbers or dashes (no spaces)';
  END IF;
  IF NEW.slug = ANY (reserved) THEN
    RAISE EXCEPTION 'The address "%" is kept for Nevorai. Choose another.', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_tenant_slug ON academy.tenants;
CREATE TRIGGER guard_tenant_slug
  BEFORE INSERT OR UPDATE OF slug ON academy.tenants
  FOR EACH ROW EXECUTE FUNCTION academy.guard_tenant_slug();

commit;

-- Proof: both must raise an error, and neither leaves a row (the second rolls back).
-- insert into academy.tenants (slug, name) values ('billing', 'x');   -- expect: address kept for Nevorai
-- insert into academy.tenants (slug, name) values ('Ab', 'x');        -- expect: 3 to 40 letters
select tgname from pg_trigger where tgrelid = 'academy.tenants'::regclass and tgname = 'guard_tenant_slug';

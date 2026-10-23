-- Nevorai Kaizen · register Nevorai Academy as a billable product (2026-10-23). Run in Nevorai OS -> SQL Editor. Safe to run twice.
-- Product side: academyos src/lib/kaizen.ts + src/routes/api/kaizen/*. Needs academy_0010_kaizen_billing.sql run first.
-- Plans are DRAFTS (public_buy = false, nothing for sale). Prices copy the ones already in the app (999 / 2,999 / 7,999 + GST);
-- change them in Products > Nevorai Academy and switch "public_buy" and "in_catalog" on when you want to sell.
-- The secret: the same 32+ characters in Vercel for Kaizen as KAIZEN_SECRET_ACADEMY and in Vercel for academyos as KAIZEN_PROVISION_SECRET.
begin;

update public.kz_products
   set provision_url = 'https://academy.nevorai.com/api/kaizen',
       secret_env    = 'KAIZEN_SECRET_ACADEMY',
       login_url     = 'https://academy.nevorai.com/auth',
       pass_enabled  = true
 where key = 'academy' and provision_url is null;

insert into public.kz_plans (tenant_id, product_key, plan_key, name, billing, price_incl_gst, list_price, gst_mode, gst_rate, limits, public_buy, summary, sort, active)
select t.id, 'academy', v.plan_key, v.name, 'monthly', v.total, v.list, 'excl', 18, v.limits::jsonb, false, v.summary, v.sort, true
  from public.kz_tenants t,
       (values
         ('starter',      'Nevorai Academy Starter',      1178.82,  999.00, '{"students":100,"coaches":5,"staff":3}',    'Students, attendance and fees, parent app, up to 100 students', 10),
         ('professional', 'Nevorai Academy Professional', 3538.82, 2999.00, '{"students":500,"coaches":25,"staff":15}',  'Everything in Starter plus match centre, coach module, automation, campaigns and online fee payments, up to 500 students', 20),
         ('enterprise',   'Nevorai Academy Enterprise',   9438.82, 7999.00, '{}',      'Everything in Professional plus AI reports, custom branding and API access, unlimited students', 30)
       ) as v(plan_key, name, total, list, limits, summary, sort)
 where t.slug = 'nevorai'
   and not exists (select 1 from public.kz_plans p where p.tenant_id = t.id and p.product_key = 'academy' and p.plan_key = v.plan_key);

commit;
notify pgrst, 'reload schema';

-- Proof: academy_registered = true, academy_plans = 3, none_public = true.
select
  (select provision_url is not null and secret_env = 'KAIZEN_SECRET_ACADEMY' from public.kz_products where key = 'academy' limit 1) as academy_registered,
  (select count(*) from public.kz_plans where product_key = 'academy') as academy_plans,
  (select bool_and(not public_buy) from public.kz_plans where product_key = 'academy') as none_public;

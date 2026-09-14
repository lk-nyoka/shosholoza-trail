-- Row Level Security and function tests.
--
-- These assert the things the app is not allowed to get wrong: that a code can
-- only be issued by the server, collected once, and only by the merchant who
-- owns the listing; that an operator cannot approve their own alert; that the
-- audit trail cannot be rewritten. Each "must FAIL" line is expected to print
-- an error - that IS the pass.
--
-- Run against a scratch Postgres (not your Supabase project):
--
--   createdb st
--   psql -d st -f supabase/tests/local_stub.sql      -- stands in for Supabase auth
--   psql -d st -f supabase/migrations/0001_init.sql
--   psql -d st -f supabase/tests/rls_test.sql
--
-- Every one of these was run and passing on PostgreSQL 16 before the schema
-- was handed over.

\set ON_ERROR_STOP off
\pset pager off

-- Fixtures, as the owner.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','passenger@x'),
  ('22222222-2222-2222-2222-222222222222','merchant@x'),
  ('33333333-3333-3333-3333-333333333333','other-merchant@x'),
  ('44444444-4444-4444-4444-444444444444','operator-a@x'),
  ('55555555-5555-5555-5555-555555555555','operator-b@x');

update profiles set role='merchant' where id in ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
update profiles set role='operator' where id in ('44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555');

insert into stops (id,name,km,lat,lon) values ('beaufort','Beaufort West',1004,-32.35,22.58);
insert into services (id,name,direction) values ('meyl','Shosholoza Meyl','southbound');
insert into places (id,stop_id,name,kind,source,claimed_by,verified_at) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa','beaufort','Karoo Pantry','deli','claimed','22222222-2222-2222-2222-222222222222',now()),
  ('bbbbbbbb-0000-0000-0000-00000000bbbb','beaufort','Unclaimed Cafe','cafe','osm',null,null);

\echo '=== 1. passenger requests a reservation (should succeed, server issues the code) ==='
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select code, state, passenger_id = auth.uid() as is_mine
  from request_reservation('aaaaaaaa-0000-0000-0000-00000000aaaa', null, current_date, 'two pies', 'idem-1');

\echo '=== 2. same idempotency key twice -> one row, same code ==='
select code from request_reservation('aaaaaaaa-0000-0000-0000-00000000aaaa', null, current_date, 'two pies', 'idem-1');
select count(*) as reservation_rows from reservations;

\echo '=== 3. passenger forges a code by writing the table directly (must FAIL) ==='
insert into reservations (code, passenger_id, place_id) values ('SZ-FAKE','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000aaaa');

\echo '=== 4. passenger self-promotes to operator (must FAIL or change nothing) ==='
update profiles set role='operator' where id = auth.uid();
select role as passenger_role_after from profiles where id = auth.uid();

\echo '=== 5. the WRONG merchant redeems the code (must be refused) ==='
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select redeem_reservation((select code from reservations limit 1));

\echo '=== 6. the right merchant redeems (ok) ==='
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select redeem_reservation((select code from reservations limit 1)) -> 'ok' as ok;

\echo '=== 7. the same code redeemed twice (must be refused) ==='
select redeem_reservation((select code from reservations limit 1));

\echo '=== 8. merchant sees only reservations for their own listing ==='
select count(*) as visible_to_right_merchant from reservations;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) as visible_to_other_merchant from reservations;

\echo '=== 9. merchant rewrites the audit trail (must FAIL) ==='
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
delete from reservation_events;
update reservation_events set event = 'collected';

\echo '=== 10. operator publishes their own alert unapproved (must FAIL) ==='
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
insert into alerts (service_id,severity,title,body,created_by,published_at)
values ('meyl','severe','Line closed','Test',auth.uid(),now());

\echo '=== 11. operator approves their own alert (must FAIL) ==='
insert into alerts (service_id,severity,title,body,created_by,approved_by,published_at)
values ('meyl','severe','Line closed','Test',auth.uid(),auth.uid(),now());

\echo '=== 12. a second operator approves it (ok) ==='
insert into alerts (id,service_id,severity,title,body,created_by,approved_by,published_at)
values ('cccccccc-0000-0000-0000-00000000cccc','meyl','warning','Delay at De Aar','Ninety minutes.',
        '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',now());
select title from alerts where published_at is not null;

\echo '=== 13. a signed-out visitor sees published alerts but no reservations ==='
set role anon; set request.jwt.claim.sub = '';
select count(*) as alerts_visible_to_anon from alerts;
select count(*) as reservations_visible_to_anon from reservations;
select count(*) as places_visible_to_anon from places;

\echo '=== 14. anon joins the interest list but cannot read it ==='
insert into interest (contact, kind, message) values ('someone@x','passenger','yes please');
select count(*) as interest_visible_to_anon from interest;
reset role;
select count(*) as interest_rows_really from interest;
\pset pager off
-- A fresh reservation, then the wrong merchant tries it with the literal code.
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select code from request_reservation('aaaaaaaa-0000-0000-0000-00000000aaaa', null, current_date, 'a loaf', 'idem-2') \gset
\echo '--- code issued:' :code
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
\echo '=== wrong merchant, literal code (expect not_your_listing) ==='
select redeem_reservation(:'code');
\echo '=== a passenger tries to redeem their own code (expect not_your_listing) ==='
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select redeem_reservation(:'code');
\echo '=== unclaimed OSM listing cannot be redeemed by anyone but an operator ==='
select code from request_reservation('bbbbbbbb-0000-0000-0000-00000000bbbb', null, current_date, null, 'idem-3') \gset unclaimed_
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select redeem_reservation(:'unclaimed_code');
\echo '=== expired code ==='
reset role;
update reservations set expires_at = now() - interval '1 hour' where code = :'code';
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select redeem_reservation(:'code');
\echo '=== audit trail after all of that ==='
reset role;
select event, count(*) from reservation_events group by event order by event;

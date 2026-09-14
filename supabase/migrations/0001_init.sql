-- ============================================================================
-- Shosholoza Trail — initial schema
-- ============================================================================
-- Run this once, in the Supabase SQL editor, against a fresh project.
--
-- The shape of this file follows one rule: anything a passenger, a merchant or
-- an attacker could lie about is decided in the database, not in the browser.
-- A reservation code is generated here. A redemption is a locked, one-time
-- transition here. An alert cannot be published by the person who wrote it.
-- Everything else — the ride, the map, the walking times — stays on the phone,
-- because that is what keeps working in the Karoo.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── Roles ───────────────────────────────────────────────────────────────────
-- Passengers sign in anonymously and never see this. Merchants and operators
-- are created by hand for the pilot; there is no self-serve path on purpose.

create type app_role as enum ('passenger', 'merchant', 'operator');

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  role         app_role not null default 'passenger',
  created_at   timestamptz not null default now()
);

-- Every auth user gets a profile. Role is always 'passenger' here; promoting
-- someone is a deliberate manual update, never something a signup can do.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, null)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helpers used inside policies. SECURITY DEFINER so that reading profiles from
-- within a profiles policy does not recurse.
create or replace function is_operator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'operator')
$$;

-- ── Reference data ──────────────────────────────────────────────────────────
-- Public to read, operator to write. This is the "one source of truth for
-- route facts" the audits kept asking for.

create table stops (
  id       text primary key,
  name     text not null,
  km       numeric(7,2) not null,
  lat      double precision not null,
  lon      double precision not null,
  province text
);

create table services (
  id        text primary key,
  name      text not null,
  direction text not null
);

create table calls (
  service_id     text not null references services on delete cascade,
  stop_id        text not null references stops,
  seq            int  not null,
  sched_time     time not null,
  day_offset     int  not null default 0,
  dwell_minutes  int  not null default 5,
  platform       text,
  primary key (service_id, seq)
);

-- What the operator says about one running of the service on one date.
create table service_status (
  service_id   text not null references services on delete cascade,
  service_date date not null,
  state        text not null default 'scheduled'
                 check (state in ('scheduled','running','delayed','cancelled')),
  note         text,
  source       text not null default 'operator',
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users,
  primary key (service_id, service_date)
);

-- ── Alerts ──────────────────────────────────────────────────────────────────
-- The safety-critical table. Nothing here reaches a passenger until a second
-- operator has approved it, and that is enforced below rather than in the UI.

create table alerts (
  id             uuid primary key default gen_random_uuid(),
  service_id     text references services on delete cascade,
  severity       text not null check (severity in ('info','warning','severe')),
  title          text not null,
  body           text not null,
  effective_from timestamptz,
  effective_to   timestamptz,
  created_by     uuid not null references auth.users,
  approved_by    uuid references auth.users,
  published_at   timestamptz,
  retracted_at   timestamptz,
  created_at     timestamptz not null default now()
);

create or replace function alerts_require_two_people()
returns trigger language plpgsql as $$
begin
  if new.published_at is not null then
    if new.approved_by is null then
      raise exception 'an alert cannot be published without an approver';
    end if;
    if new.approved_by = new.created_by then
      raise exception 'an alert must be approved by someone other than its author';
    end if;
  end if;
  -- A published alert is withdrawn by retracting it, never by editing it away.
  if tg_op = 'UPDATE' and old.published_at is not null
     and new.published_at is distinct from old.published_at then
    raise exception 'a published alert cannot be unpublished; retract it instead';
  end if;
  return new;
end $$;

create trigger alerts_two_person_control
  before insert or update on alerts
  for each row execute function alerts_require_two_people();

-- ── Places and offers ───────────────────────────────────────────────────────
-- source = 'osm' means nobody at this business has agreed to anything, and the
-- app must keep saying so. It becomes 'claimed' only when a verified merchant
-- takes the listing over.

create table places (
  id          uuid primary key default gen_random_uuid(),
  -- The app's own stable identifier for this listing, so the client can ask for
  -- "the craft market at Church Square" without knowing a UUID it was never
  -- given. Editorial cards carry 'ed:<id>'; OpenStreetMap entries 'osm:<stop>:<name>'.
  slug        text unique,
  stop_id     text not null references stops,
  name        text not null,
  kind        text not null,
  lat         double precision,
  lon         double precision,
  distance_km numeric(5,2),
  cuisine     text,
  source      text not null default 'osm' check (source in ('osm','claimed')),
  claimed_by  uuid references auth.users,
  verified_at timestamptz,
  verified_by uuid references auth.users,
  created_at  timestamptz not null default now(),
  unique (stop_id, name, kind)
);

create index places_stop_idx on places (stop_id);

create table offers (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references places on delete cascade,
  title       text not null,
  body        text,
  price_cents int check (price_cents >= 0),
  active      boolean not null default true,
  valid_from  date,
  valid_to    date,
  created_at  timestamptz not null default now()
);

create index offers_place_idx on offers (place_id) where active;

-- Defined here rather than beside is_operator() because it reads places, and a
-- SQL-language function is parsed the moment it is created.
create or replace function is_merchant_of(p_place uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from places
    where id = p_place and claimed_by = auth.uid() and verified_at is not null
  )
$$;


-- ── The passenger's own trip ────────────────────────────────────────────────

create table trips (
  id            uuid primary key default gen_random_uuid(),
  passenger_id  uuid not null references auth.users on delete cascade,
  board_stop    text not null references stops,
  alight_stop   text not null references stops,
  service_date  date,
  stop_minutes  int not null default 5,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint trip_is_a_journey check (board_stop <> alight_stop)
);

-- One live trip per passenger: the app models a single journey, and this is
-- what lets the client upsert it rather than accumulate a row per edit.
create unique index trips_passenger_idx on trips (passenger_id);

-- ── Reservations ────────────────────────────────────────────────────────────
-- The code is generated here and nowhere else. The alphabet excludes every
-- character that is ambiguous when read aloud across a platform.

create table reservations (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  passenger_id uuid not null references auth.users on delete cascade,
  place_id     uuid not null references places,
  offer_id     uuid references offers,
  service_date date,
  note         text,
  state        text not null default 'requested'
                 check (state in ('requested','accepted','declined','collected','expired','cancelled')),
  -- Supplied by the client so a retried submission cannot create a second row.
  idempotency_key text unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '36 hours',
  redeemed_at  timestamptz,
  redeemed_by  uuid references auth.users
);

create index reservations_passenger_idx on reservations (passenger_id);
create index reservations_place_idx on reservations (place_id);

-- Append-only. Update and delete are revoked below for everyone but the owner.
create table reservation_events (
  id             bigserial primary key,
  reservation_id uuid not null references reservations on delete cascade,
  event          text not null,
  actor          uuid references auth.users,
  detail         text,
  at             timestamptz not null default now()
);

create index reservation_events_res_idx on reservation_events (reservation_id);

create or replace function make_reservation_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ACDEFHJKLMNPRTVWXY349';
  candidate text;
  i int;
begin
  loop
    candidate := 'SZ-';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from reservations where code = candidate);
  end loop;
  return candidate;
end $$;

-- The only way a passenger creates a reservation. Returns the row, code and all.
create or replace function request_reservation(
  p_place_slug      text,
  p_offer_id        uuid default null,
  p_service_date    date default null,
  p_note            text default null,
  p_idempotency_key text default null
) returns reservations
language plpgsql security definer set search_path = public as $$
declare
  existing   reservations;
  created    reservations;
  v_place_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  -- The client names a listing that already exists. It cannot invent one.
  select id into v_place_id from places where slug = p_place_slug;
  if v_place_id is null then
    raise exception 'no such place: %', p_place_slug using errcode = '23503';
  end if;

  if p_idempotency_key is not null then
    select * into existing from reservations
      where idempotency_key = p_idempotency_key and passenger_id = auth.uid();
    if found then
      return existing;
    end if;
  end if;

  insert into reservations (code, passenger_id, place_id, offer_id, service_date, note, idempotency_key)
  values (make_reservation_code(), auth.uid(), v_place_id, p_offer_id,
          p_service_date, p_note, p_idempotency_key)
  returning * into created;

  insert into reservation_events (reservation_id, event, actor)
  values (created.id, 'requested', auth.uid());

  return created;
end $$;

-- Redemption. One time, under a row lock, by the merchant who owns the place.
create or replace function redeem_reservation(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r reservations;
begin
  select * into r from reservations where code = upper(trim(p_code)) for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_such_code');
  end if;
  if not (is_merchant_of(r.place_id) or is_operator()) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_listing');
  end if;
  if r.state = 'collected' then
    return jsonb_build_object('ok', false, 'reason', 'already_collected',
                              'redeemed_at', r.redeemed_at);
  end if;
  if r.state in ('declined','cancelled','expired') then
    return jsonb_build_object('ok', false, 'reason', r.state);
  end if;
  if r.expires_at < now() then
    update reservations set state = 'expired' where id = r.id;
    insert into reservation_events (reservation_id, event, actor) values (r.id, 'expired', auth.uid());
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  update reservations
     set state = 'collected', redeemed_at = now(), redeemed_by = auth.uid()
   where id = r.id
   returning * into r;

  insert into reservation_events (reservation_id, event, actor) values (r.id, 'collected', auth.uid());

  return jsonb_build_object('ok', true, 'reservation', to_jsonb(r));
end $$;

-- ── Interest list ───────────────────────────────────────────────────────────
-- Deliberately thin: an optional contact and what they had to say. No name, no
-- tracking, nothing anyone would mind a stranger seeing.

create table interest (
  id         bigserial primary key,
  contact    text,
  kind       text not null default 'passenger' check (kind in ('passenger','merchant','operator')),
  message    text,
  source     text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Every table. No exceptions — an un-enabled table is a public table.

alter table profiles           enable row level security;
alter table stops              enable row level security;
alter table services           enable row level security;
alter table calls              enable row level security;
alter table service_status     enable row level security;
alter table alerts             enable row level security;
alter table places             enable row level security;
alter table offers             enable row level security;
alter table trips              enable row level security;
alter table reservations       enable row level security;
alter table reservation_events enable row level security;
alter table interest           enable row level security;

-- Reference data: anyone may read, only an operator may change it.
create policy ref_read_stops     on stops          for select using (true);
create policy ref_read_services  on services       for select using (true);
create policy ref_read_calls     on calls          for select using (true);
create policy ref_read_status    on service_status for select using (true);
create policy ref_read_places    on places         for select using (true);
create policy ref_read_offers    on offers         for select using (active);

create policy ref_write_stops    on stops          for all using (is_operator()) with check (is_operator());
create policy ref_write_services on services       for all using (is_operator()) with check (is_operator());
create policy ref_write_calls    on calls          for all using (is_operator()) with check (is_operator());
create policy ref_write_status   on service_status for all using (is_operator()) with check (is_operator());
create policy ref_write_places   on places         for all using (is_operator()) with check (is_operator());

-- A verified merchant maintains the offers on the listing they claimed.
create policy merchant_offers on offers for all
  using (is_merchant_of(place_id)) with check (is_merchant_of(place_id));

-- Alerts: a passenger sees only what was published and not retracted.
create policy alerts_read_published on alerts for select
  using (published_at is not null and retracted_at is null);
create policy alerts_read_operator  on alerts for select using (is_operator());
create policy alerts_write_operator on alerts for all
  using (is_operator()) with check (is_operator());

-- Profiles: your own, plus operators can see everyone.
create policy profile_self on profiles for select using (id = auth.uid() or is_operator());
create policy profile_edit on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = 'passenger');

-- Trips: strictly the passenger's own.
create policy trips_own on trips for all
  using (passenger_id = auth.uid()) with check (passenger_id = auth.uid());

-- Reservations: the passenger who made it, or the merchant who must fulfil it.
create policy reservations_read on reservations for select
  using (passenger_id = auth.uid() or is_merchant_of(place_id) or is_operator());

-- Note there is no INSERT policy: request_reservation() is the only door in,
-- so a client cannot invent a code by writing the table directly.
create policy reservations_cancel on reservations for update
  using (passenger_id = auth.uid() and state in ('requested','accepted'))
  with check (passenger_id = auth.uid() and state = 'cancelled');

create policy reservations_merchant_decide on reservations for update
  using (is_merchant_of(place_id))
  with check (is_merchant_of(place_id) and state in ('accepted','declined'));

create policy reservation_events_read on reservation_events for select
  using (exists (
    select 1 from reservations r where r.id = reservation_id
      and (r.passenger_id = auth.uid() or is_merchant_of(r.place_id) or is_operator())
  ));

-- Interest: write-only for the public. You may add your name to the list; you
-- may not read the list.
create policy interest_insert on interest for insert with check (true);
create policy interest_read   on interest for select using (is_operator());

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Supabase grants these by default, but spelling them out means this file can
-- be run anywhere and means the privileges are reviewable in one place. RLS
-- still decides every row; a grant only says which verbs are on the table.

grant usage on schema public to anon, authenticated;
grant select on stops, services, calls, service_status, places, offers, alerts to anon, authenticated;
grant select on profiles, reservation_events to authenticated;
-- SELECT on reservations, but never INSERT: request_reservation() is the only
-- way one comes into existence, so a client cannot mint its own code.
grant select on reservations to authenticated;
grant select on interest to authenticated;
grant select, insert, update, delete on trips to authenticated;
grant select, insert, update on profiles to authenticated;
grant insert on interest to anon, authenticated;
grant select, insert, update, delete on places, offers, service_status, alerts, stops, services, calls to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- The audit trail is append-only even for operators.
revoke update, delete on reservation_events from anon, authenticated;
revoke insert, update, delete on reservations from anon, authenticated;
grant  update on reservations to authenticated;   -- narrowed by the policies above

grant execute on function request_reservation(text, uuid, date, text, text) to authenticated;
grant execute on function redeem_reservation(text) to authenticated;

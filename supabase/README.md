# Backend setup — Shosholoza Trail

Everything here is on Supabase's free tier. Nothing in this folder costs money
to run, and the app works with none of it configured.

**You do the account steps yourself.** I don't create accounts or handle
passwords and keys — that's yours, and it should stay that way.

---

## 1. Create the project (5 minutes)

1. Go to supabase.com and create a project.
2. **Region:** pick a South African region if one is offered. At the time of
   writing there isn't one, so choose **EU (Frankfurt or Ireland)**. POPIA
   section 72 allows transfer to a country with comparable protection, and the
   EU qualifies — that's a defensible answer if a judge asks. A US region is
   harder to defend.
3. Name it `shosholoza-trail`. Save the database password somewhere safe; you
   will almost never need it.

> **Free-tier warning.** A free project pauses after about a week of no
> traffic. A paused database on demo morning would be a disaster. Either open
> the app once a day in the run-up, or pay the ~$25 for the month of the event.

## 2. Run the schema

Open **SQL Editor** in the Supabase dashboard, then run, in this order:

1. `supabase/migrations/0001_init.sql`
2. `supabase/seed.sql`

The seed is idempotent — re-running it after the data files change updates the
rows rather than duplicating them. Regenerate it with:

```
npx esbuild scripts/seed-sql.ts --bundle --platform=node --format=cjs \
  --outfile=scripts/.seed.cjs && node scripts/.seed.cjs > supabase/seed.sql
```

## 3. Turn on anonymous sign-in

**Authentication → Sign In / Providers → Anonymous sign-ins → enable.**

This is what lets a passenger have a real account without a form, a password or
an email. If you leave it off, the app silently stays device-local — which is
exactly what it did before, so nothing breaks.

## 4. Point the app at it

Copy the **Project URL** and the **anon / publishable key** from
**Project Settings → API** into `.env`:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Then set the same two variables in **Netlify → Site settings → Environment
variables**, and redeploy.

> The anon key belongs in the bundle. It is public by design, and Row Level
> Security decides what it can see.
>
> The **service_role key must never** go in `.env`, in the repo, in Netlify, or
> in a message. It bypasses RLS completely. If it ever leaks, rotate it
> immediately in Project Settings → API.

## 5. Make yourself an operator

Sign in once so a user row exists, then in the SQL editor:

```sql
update profiles set role = 'operator'
where id = (select id from auth.users where email = 'you@example.com');
```

Do the same with `'merchant'` for a trader, and claim their listing:

```sql
update places
   set claimed_by  = '<their auth user id>',
       verified_at = now(),
       verified_by = '<your auth user id>',
       source      = 'claimed'
 where slug = 'ed:market';
```

---

## What the database enforces, so the app doesn't have to

These are not UI conventions. They are constraints, and a client cannot talk
its way past them — each one was tested against a real Postgres before this
was written.

| Rule | How |
|---|---|
| A reservation code can only be issued by the server | No `INSERT` grant on `reservations`; `request_reservation()` is the only door |
| A code can only be collected once | `redeem_reservation()` takes a row lock and checks state |
| Only the merchant who owns the listing can collect it | `is_merchant_of()`, checked inside the function |
| A passenger cannot collect their own code | Same check — being the passenger isn't being the merchant |
| A retried request doesn't become a second reservation | `idempotency_key`, unique, supplied by the device |
| An alert cannot be published by the person who wrote it | `alerts_two_person_control` trigger |
| A published alert cannot be quietly unpublished | Same trigger — retract it instead |
| The audit trail cannot be edited | `UPDATE`/`DELETE` revoked on `reservation_events` |
| A passenger cannot promote themselves to operator | `profile_edit` policy pins `role = 'passenger'` |
| One passenger cannot see another's reservations | `reservations_read` policy |
| A signed-out visitor sees published alerts and nothing private | RLS on every table, no exceptions |
| Nobody can read the interest list but an operator | `interest_read` policy |

## What is deliberately still missing

- Payments. Reserve-and-collect, pay in person. No PCI scope, no float, no
  chargebacks, and it matches how these traders already work.
- Merchant self-serve signup. Twenty traders don't need one, and a manual
  verification step is the only thing making "verified" mean anything.
- A live train position feed. There isn't one to consume. Until PRASA provides
  it, `service_status` stays empty and the app says so.

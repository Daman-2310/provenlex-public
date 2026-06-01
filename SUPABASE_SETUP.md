# Supabase Setup — Step-by-Step

This document walks Daman through wiring the Supabase project he just created
into Genesis Swarm. Total time: ~15 minutes.

**Project region MUST be EU (Ireland or Frankfurt).** This is non-negotiable
for GDPR compliance. The DPA at `/dpa` declares EU storage location.

---

## Step 1 — Apply the initial migration

Genesis ships a single initial migration at
`supabase/migrations/20260530180000_initial_schema.sql`. It creates 10 tables
(profiles, tenants, tenant_members, vindications, whistleblower_tips,
witness_signatures, watchlist_anchors, alert_subscriptions, api_keys,
audit_log), with Row Level Security policies, triggers, and helper functions.

### Option A — Run via Supabase Dashboard SQL Editor (recommended for first run)

1. Open your project at https://supabase.com/dashboard
2. Left sidebar → **SQL Editor**
3. Click **New query**
4. Open `supabase/migrations/20260530180000_initial_schema.sql` in your editor
5. Copy the entire file, paste into the SQL Editor
6. Click **Run** (lower-right). Should complete in 2-3 seconds.
7. Verify: left sidebar → **Database → Tables** — you should see all 10 tables

### Option B — Run via Supabase CLI (for future migrations)

```bash
# One-time install
brew install supabase/tap/supabase

# From the repo root:
cd /Users/damansharma/genesis-swarm
supabase link --project-ref YOUR_PROJECT_REF  # find in dashboard URL
supabase db push
```

---

## Step 2 — Grab your three env vars

In the Supabase dashboard:

1. Left sidebar → **⚙️ Settings → API**
2. You'll see four values. Copy three of them:

| Field name in dashboard | Save as env var | Sensitivity |
|---|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` | public (client-visible) |
| **Project API Keys → `anon` `public`** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public (client-visible) |
| **Project API Keys → `service_role` `secret`** | `SUPABASE_SERVICE_ROLE_KEY` | **SECRET — never commit, never paste in chat, never log** |

---

## Step 3 — Add env vars to Vercel

1. Open Vercel dashboard → your `genesis-swarm-rgq5` project
2. **Settings → Environment Variables**
3. Add all three. For each:
   - Set the **Name** exactly as listed above
   - Paste the **Value**
   - Apply to **Production, Preview, Development** (tick all three)
4. Click **Save**

---

## Step 4 — Configure OAuth providers (Google + GitHub)

This is OPTIONAL — magic-link sign-in works without it. But OAuth dramatically
boosts conversion.

### Google OAuth

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create a project (or use an existing one)
2. **APIs & Services → Credentials → + CREATE CREDENTIALS → OAuth Client ID**
3. Application type: **Web application**
4. Authorized redirect URIs — add this exact URL:
   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```
   (find your project ref in the Supabase dashboard URL)
5. Click **CREATE**. Copy the **Client ID** and **Client Secret**.
6. Back in Supabase dashboard → **Authentication → Providers → Google**
7. Toggle **Enable**, paste Client ID + Client Secret, click **Save**

### GitHub OAuth

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
2. Authorization callback URL: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
3. Application name: `Genesis Swarm`
4. Click **Register application**, then **Generate a new client secret**
5. Back in Supabase dashboard → **Authentication → Providers → GitHub**
6. Toggle **Enable**, paste Client ID + Client Secret, click **Save**

---

## Step 5 — Configure Supabase Auth email settings

1. Supabase dashboard → **Authentication → URL Configuration**
2. **Site URL**: `https://genesis-swarm-rgq5.vercel.app`
3. **Redirect URLs** (additional allowed): add both:
   ```
   http://localhost:3000/auth/callback
   https://genesis-swarm-rgq5.vercel.app/auth/callback
   ```
4. **Authentication → Email Templates → Magic Link**: customise to brand if you want. Default is fine for v1.

---

## Step 6 — Optional but recommended: enable email confirmation

By default Supabase requires email confirmation for new sign-ups via password
flow. For magic-link the email confirmation is implicit. No action needed for v1.

---

## Step 7 — Deploy + verify

```bash
git push
```

Vercel will rebuild with the new env vars. After deploy:

1. Open https://genesis-swarm-rgq5.vercel.app/login
2. You should see "Magic link, Google, or GitHub — pick one." subtitle
   (instead of legacy "We will email you a one-tap magic link.")
3. Try the magic-link path with your own email.
4. After clicking the link in the email, you should land on `/dashboard`.

---

## What happens behind the scenes

- **On sign-in**: Supabase sends a magic-link email. Click → redirect to
  `/auth/callback?code=…` → our handler exchanges the code for a session
  cookie, calls `ensure_default_tenant()` to create a personal tenant if
  needed, and redirects to `/dashboard` (or `?next=`).

- **On every request**: `middleware.ts` calls `refreshSupabaseSession()`,
  which validates the session cookie with Supabase and refreshes the access
  token if needed. Iron-session legacy cookies keep working alongside.

- **Server components / route handlers**: use `createServerClient()` from
  `lib/supabase.ts`. It reads the session from cookies. RLS automatically
  scopes all queries to what the signed-in user is allowed to see.

- **Trusted server contexts (cron, webhooks)**: use `createServiceClient()`
  from `lib/supabase.ts`. It uses the service-role key and bypasses RLS.
  Use sparingly.

- **Browser components**: use `createBrowserClient()`. Browser client signs
  in via OAuth/magic-link, never reads service-role key.

---

## Cost expectations

- Free tier: 500 MB Postgres, 50K monthly active users, 5 GB egress
- Genesis at current scale fits comfortably in free tier for first 10-20 paying customers
- Pro tier ($25/mo): 8 GB Postgres, 100K MAU, point-in-time recovery
- Upgrade trigger: when you hit ~5 paying customers OR when investor DD asks about backup posture

---

## Troubleshooting

**"Supabase env vars missing" error in browser console**
→ Env vars not added to Vercel, or build didn't pick them up. Re-deploy.

**Magic link email not arriving**
→ Check Supabase dashboard → Authentication → Logs. Often Resend/SendGrid
quota issue, or email landed in spam.

**OAuth redirect returns "invalid redirect URI"**
→ The callback URL in Google/GitHub OAuth settings doesn't match
`https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` exactly. Recheck.

**RLS denies a query that should be allowed**
→ User isn't a member of the right tenant. Run in SQL editor:
```sql
select * from tenant_members where user_id = 'USER_UUID';
```
If empty: call `select ensure_default_tenant('USER_UUID', 'Display Name');`

**"function ensure_default_tenant does not exist"**
→ Migration didn't fully run. Re-run the initial migration SQL.

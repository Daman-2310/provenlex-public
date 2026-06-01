# Deploying Genesis Swarm

## Option A — Hugging Face Spaces (Free, Always On, No Card Required)

HF Spaces runs Docker containers 24/7 on a free CPU tier. No credit card. No sleeping.

### Step 1 — Create the Space
1. Go to **huggingface.co** → sign in (or create account)
2. Click **New Space** → SDK: **Docker** → Name: **genesis-swarm-api**
3. Visibility: **Public** → **Create Space**

### Step 2 — Push code
```bash
# Add HF as a remote (replace YOUR_HF_USERNAME)
git remote add hf https://huggingface.co/spaces/YOUR_HF_USERNAME/genesis-swarm-api

# Push
git push hf main
```
HF detects `sdk: docker` in README.md and builds with `Dockerfile.api` automatically.

### Step 3 — Set Secrets
Space → **Settings** → **Variables and secrets**:

| Name | Value | Type |
|------|-------|------|
| `ANTHROPIC_API_KEY` | your-key | Secret |
| `GENESIS_AUTH_DISABLED` | `true` | Variable |
| `GENESIS_AUDIT_DB` | `/tmp/genesis_audit.db` | Variable |

### Step 4 — Your URLs
After build completes (2–5 min):
- API: `https://YOUR_HF_USERNAME-genesis-swarm-api.hf.space`
- Health: `https://YOUR_HF_USERNAME-genesis-swarm-api.hf.space/api/health`
- WSS: `wss://YOUR_HF_USERNAME-genesis-swarm-api.hf.space/ws/compliance/review`

---

## Option B — Vercel (Frontend: jarvis-ui)


Two parts: a Python backend (Railway or Render) and a Next.js frontend (Vercel).
Each is independent — the frontend only needs the backend URL as an env var.

---

## Part 1 — Backend (choose one)

### Option A: Railway (recommended, zero config)

1. **Fork** `Daman-2310/genesis-swarm` on GitHub if you haven't already.
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo.
3. Select your fork → select the `main` branch.
4. Railway auto-detects Python and runs `railway.toml`. No changes needed.
5. Under **Variables**, add:
   ```
   GENESIS_JWT_SECRET   <paste a 64-char random string>
   ```
   Optional but recommended:
   ```
   ANTHROPIC_API_KEY    <your key — enables /api/ai/chat>
   AISSTREAM_API_KEY    <free at aisstream.io — enables live AIS vessel data>
   ```
6. Click **Deploy**. First build takes ~4 minutes (pip installs).
7. Copy the `https://*.up.railway.app` URL — you need it for the frontend.

> Free tier: 500 hours/month, 512 MB RAM, sleeps after 10 min inactivity.
> First request after sleep takes ~15s. Acceptable for a demo.

---

### Option B: Render (free tier, Frankfurt region)

1. Go to [render.com](https://render.com) → New → Web Service → Connect GitHub.
2. Select your fork → Render auto-reads `render.yaml`.
3. Under **Environment**, add:
   ```
   GENESIS_JWT_SECRET   <64-char random string>   (or click "Generate")
   ```
4. Click **Create Web Service**. First deploy ~5 minutes.
5. Copy the `https://*.onrender.com` URL.

> Free tier: spins down after 15 min inactivity. First cold start: ~30s.

---

## Part 2 — Frontend (Vercel)

The frontend is already deployed at `https://genesis-swarm-terminal.vercel.app`.
To point it at your live backend:

### If you own the Vercel project

1. Go to your Vercel project → Settings → Environment Variables.
2. Add:
   ```
   NEXT_PUBLIC_API_URL   https://your-railway-or-render-url.com
   ```
3. Redeploy (Deployments → Redeploy most recent).

### If you're forking and deploying your own frontend

1. Fork the repo. Go to [vercel.com](https://vercel.com) → New Project → Import.
2. Set **Root Directory** to `jarvis-ui`.
3. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL   https://your-backend-url.com
   ```
4. Deploy. ~2 minutes.

---

## Part 3 — CORS (if you get 403 on API calls)

By default the backend allows all origins (`*`). To restrict to your domain:

On Railway/Render, add:
```
SWARM_CORS_ORIGINS   ["https://your-project.vercel.app","http://localhost:3000"]
```

---

## Part 4 — Verify it's working

```bash
# Liveness
curl https://your-backend.up.railway.app/api/health

# Bot status (no auth required)
curl https://your-backend.up.railway.app/api/bots

# Login
curl -X POST https://your-backend.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"genesis2024"}'

# Wirecard simulation
curl https://your-backend.up.railway.app/api/simulation/wirecard
```

Expected: all return JSON, `/api/health` returns `{"ok": true}`.

---

## Part 5 — 3-node distributed PBFT (optional, shows real distributed consensus)

See [docker-compose.pbft.yml](docker-compose.pbft.yml). Runs 3 independent PBFT
replica processes on separate containers with real TCP communication between them.

```bash
# Requires: Docker + grpcio installed (pip install grpcio>=1.63)
docker compose -f docker-compose.pbft.yml up

# Watch consensus happen across processes:
docker compose -f docker-compose.pbft.yml logs -f
```

---

## Environment variable reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `GENESIS_JWT_SECRET` | Yes (prod) | `genesis-dev-secret` | JWT signing secret |
| `GENESIS_USERS` | No | admin/operator/viewer with `genesis2024` | JSON: `{"alice":{"hash":"$2b...","roles":["admin"]}}` |
| `GENESIS_CASE_DB_PATH` | No | `cases.db` | SQLite path for case management |
| `SWARM_CORS_ORIGINS` | No | `["*"]` | JSON list of allowed CORS origins |
| `ANTHROPIC_API_KEY` | No | — | Enables `/api/ai/chat` (JARVIS) |
| `AISSTREAM_API_KEY` | No | — | Enables live AIS vessel tracking in CargoBot |
| `GENESIS_SLACK_WEBHOOK` | No | — | Slack alert webhook URL |
| `GENESIS_ALERT_EMAIL` | No | — | Email address for critical alerts |
| `GENESIS_SMTP_HOST` | No | `smtp.gmail.com` | SMTP server |
| `GENESIS_SMTP_PORT` | No | `587` | SMTP port |
| `GENESIS_SMTP_USER` | No | — | SMTP username |
| `GENESIS_SMTP_PASS` | No | — | SMTP password (app password for Gmail) |
| `LOG_LEVEL` | No | `INFO` | `DEBUG`, `INFO`, `WARNING` |
| `PORT` | No | `8080` | Injected automatically by Railway/Render |

---

## Troubleshooting

**Build fails with `ModuleNotFoundError`**
The `requirements.txt` intentionally excludes heavy deps (`torch`, `chromadb`,
`sentence-transformers`). The cloud app gracefully falls back to in-memory stores
when these are absent. If you see a missing module that isn't in `requirements.txt`,
open an issue.

**`/api/health` returns 502 immediately after deploy**
The startup takes 10–20s while bots initialise and fetch live data (OFAC SDN,
ECB FX rates). The healthcheck retries 5 times at 15s intervals. Wait 90s.

**WebSocket disconnects in the dashboard**
Railway free tier sleeps after 10 min idle. The frontend reconnects automatically
with exponential backoff. First reconnect after sleep takes ~15s.

**CORS error in browser console**
Add `SWARM_CORS_ORIGINS=["https://your-vercel-url.vercel.app"]` to backend env vars
and redeploy.

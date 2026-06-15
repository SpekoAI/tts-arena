# TTS Arena

A public, **anonymous** multilingual Text-to-Speech arena. Pick the language
you natively speak (one tap, no account), then vote on blind A/B audio pairs —
which voice sounds more natural? Votes feed a **Bradley-Terry MLE leaderboard
per language**, with bootstrap confidence intervals.

## What this is

- **No authentication.** No login, no accounts, no Supabase. Your identity is a
  single anonymous cookie UUID (`anon_id`) used only for rate-limiting, dedup,
  and a tiny session counter. No PII is collected.
- **One-tap native language.** On entry you tap the language you speak; it is
  stored in a `lang` cookie (unverified, by design). The pair's language
  decides which leaderboard your vote counts toward; your declared language is
  stored on the vote so the leaderboard can optionally be filtered to
  native-only voters later.
- **Blind A/B.** You see the prompt text and two play buttons. Vendor and model
  names are hidden until *after* you submit a vote, then briefly revealed before
  the next pair loads.
- **Ranking is pure TypeScript.** A Bradley-Terry maximum-likelihood fit
  (Hunter MM, with tie support and percentile-bootstrap 95% CIs) runs in a
  Node.js cron route — no Python, no Modal, no extra services.

The competitor unit is a **system** = provider + model + optional voice (e.g.
`ElevenLabs / eleven_multilingual_v2 / Rachel`). A leaderboard is computed
per language.

## Deployed

The live arena runs on **Vercel** (Next.js app + API + cron), with audio in a
**public GCS bucket**. The Cloud Run path in [Deploy to GCP](#deploy-to-gcp)
below is the all-GCP alternative, not the current host.

| Piece | Where |
|-------|-------|
| Source | [`SpekoAI/tts-arena`](https://github.com/SpekoAI/tts-arena) — `main` auto-deploys to Vercel |
| App | Vercel team `speko`, project `tts-arena` — **https://tts-arena-plum.vercel.app** |
| Audio | GCP project `speko-tts-arena` (billing: *Speko startup credits*), public bucket `gs://speko-tts-arena-audio` → `https://storage.googleapis.com/speko-tts-arena-audio` |
| Status | `DEMO_MODE=1` — local macOS-voice clips + illustrative leaderboard, no database yet |

**To go live for real:** provision a Neon database, set `DATABASE_URL` (and the
already-set `GCS_PUBLIC_BASE_URL`) on Vercel, remove `DEMO_MODE`, then seed
(synthesize each provider's *native* voice → loudness-normalize → upload to the
bucket → `scripts/seed.ts`). Bradley-Terry recompute moves to **Vercel Cron**
hitting `/api/cron/bt` — note the route's `x-cron-secret` check needs swapping
for Vercel Cron's `Authorization: Bearer $CRON_SECRET` convention at that point.

## Local dev

Use **bun** / **bunx** only — never npm/npx.

```bash
bun install

# Configure env (copy and fill in):
cp .env.example .env
#   DATABASE_URL          Neon Postgres HTTP connection string
#   GCS_PUBLIC_BASE_URL   public bucket base, e.g. https://storage.googleapis.com/tts-arena-public
#   CRON_SECRET           long random string guarding POST /api/cron/bt
#   (optional) NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET

# Push the Drizzle schema to the database:
bun run db:push

# Seed systems, prompts, samples, and cross-system pairs:
bun run scripts/seed.ts --prompts content/prompts.example.json
#   (see "Seeding" below for the audio wiring + --dry-run)

bun run dev          # http://localhost:3000
```

### Seeding

`scripts/seed.ts` reads a prompts JSON (see
[`content/prompts.example.json`](content/prompts.example.json)) and:

1. Upserts **systems** (the competitors).
2. Inserts **prompts** (unique per `language + text`).
3. Inserts **samples** — one rendered clip per *system × prompt* in a language,
   with a public GCS `audioUrl`.
4. Generates **pairs** — every *cross-system* pairing of samples that share a
   prompt, stored canonically as `sampleAId < sampleBId` and never pairing a
   system with itself.
5. Inserts **gold pairs** for prompts flagged `isGold`.

```bash
# Dry run — prints what would be inserted (systems/prompts/samples/pairs),
# performs no writes. Needs DATABASE_URL set (no connection is opened):
DATABASE_URL=postgresql://u:p@localhost/db bun run scripts/seed.ts \
  --prompts content/prompts.example.json --dry-run

# Real run — requires DATABASE_URL + GCS_PUBLIC_BASE_URL.
# Optionally pass --audio <dir> to skip samples whose local audio is missing.
bun run scripts/seed.ts \
  --prompts content/prompts.example.json \
  --audio   ./audio
```

The seed script is re-runnable (idempotent via the schema's unique
constraints). The audio-URL construction lives in a single function
(`buildAudioUrl`) — adapt it to your bucket layout. The pair-generation logic
is real and correct; only the audio wiring carries `TODO`s.

## Architecture

```
 Browser (anon cookie)
      │  GET /api/pair?lang=…   POST /api/vote   GET /api/leaderboard?lang=…
      ▼
 Next.js 15 (App Router, standalone) ── Cloud Run (stateless, autoscaled)
      │  @neondatabase/serverless (HTTP driver — no pool, no VPC)
      ▼
 Neon Postgres  ◄── Cloud Scheduler ──► POST /api/cron/bt  (x-cron-secret)
                                          └─ pure-TS Bradley-Terry → rankings

 Audio clips: public GCS bucket (plain public URLs, no signing)
```

- **App:** Next.js 15 App Router, TypeScript (strict), Tailwind v3. Built as a
  standalone server (`output: 'standalone'` in `next.config.ts`).
- **DB:** Neon Postgres over the `@neondatabase/serverless` HTTP driver —
  stateless fetch-based queries, ideal for short-lived Cloud Run requests.
- **Audio:** a **public** GCS bucket. Sample `audioUrl`s are plain public
  object URLs; no signed URLs.
- **Ranking:** `src/lib/ranking/bt-mle.ts` (pure functions) invoked by
  `POST /api/cron/bt`, which Cloud Scheduler hits on an interval. Results land
  in the `rankings` table; the leaderboard reads the latest snapshot.

This deployment is **intentionally isolated** from any other infrastructure —
its own GCP project, its own Neon database, its own bucket.

## Deploy to GCP

> **Review every command before running.** These create billable resources.
> Replace the placeholder values (`PROJECT_ID`, `REGION`, secrets, URLs). This
> stack is meant to live in its own GCP project, separate from anything else.

```bash
# --- 0. Variables (edit these) -----------------------------------------
export PROJECT_ID="tts-arena"            # a NEW, isolated project
export REGION="us-central1"
export REPO="tts-arena"                  # Artifact Registry repo
export SERVICE="tts-arena"               # Cloud Run service
export BUCKET="tts-arena-public"         # public audio bucket (globally unique)
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE:latest"

export DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
export GCS_PUBLIC_BASE_URL="https://storage.googleapis.com/$BUCKET"
export CRON_SECRET="$(openssl rand -hex 32)"   # save this — Scheduler needs it

gcloud config set project "$PROJECT_ID"

# --- 1. Enable APIs ----------------------------------------------------
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com

# --- 2. Public GCS bucket for audio ------------------------------------
gcloud storage buckets create "gs://$BUCKET" \
  --location="$REGION" \
  --uniform-bucket-level-access
# Make objects publicly readable (audio is served by plain public URL):
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="allUsers" --role="roles/storage.objectViewer"
# Upload rendered, loudness-normalized clips under the seed's path scheme, e.g.:
#   gs://$BUCKET/<language>/<systemId>/<promptKey>.mp3

# --- 3. Build & push the image to Artifact Registry --------------------
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location="$REGION"
gcloud builds submit --tag "$IMAGE" .
# (or build locally with the Dockerfile and `docker push "$IMAGE"`)

# --- 4. Deploy to Cloud Run --------------------------------------------
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars="DATABASE_URL=$DATABASE_URL,GCS_PUBLIC_BASE_URL=$GCS_PUBLIC_BASE_URL,CRON_SECRET=$CRON_SECRET"
# Grab the deployed URL:
export SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --format='value(status.url)')"

# --- 5. Push the schema + seed (run from your machine) -----------------
#   bun run db:push
#   bun run scripts/seed.ts --prompts content/prompts.example.json

# --- 6. Cloud Scheduler → recompute Bradley-Terry every 5 min ----------
gcloud scheduler jobs create http tts-arena-bt \
  --location="$REGION" \
  --schedule="*/5 * * * *" \
  --uri="$SERVICE_URL/api/cron/bt" \
  --http-method=POST \
  --headers="x-cron-secret=$CRON_SECRET"
```

### All-GCP alternative: Cloud SQL instead of Neon

If you prefer to keep everything inside GCP, swap Neon for **Cloud SQL for
PostgreSQL**. Note Cloud SQL is a stateful instance reached over a Unix socket
or the Cloud SQL Auth Proxy / a Serverless VPC connector — so you would replace
the `@neondatabase/serverless` HTTP driver with a standard `pg`/`postgres`
driver and attach the instance via `--add-cloudsql-instances` (or a VPC
connector) on `gcloud run deploy`. Neon's HTTP driver is the simpler default
here precisely because it needs no pool and no VPC.

## Project layout

```
src/lib/db/schema.ts      Drizzle schema (systems, prompts, samples, pairs, …)
src/lib/db/client.ts      Neon HTTP Drizzle client
src/lib/types.ts          shared wire types + LANGUAGES set
src/lib/ranking/bt-mle.ts pure-TS Bradley-Terry MLE + bootstrap CIs
src/app/                  pages + API routes
scripts/seed.ts           seed systems/prompts/samples/pairs from JSON
content/prompts.example.json   example seed input (en + es)
Dockerfile                multi-stage Bun build → standalone Cloud Run server
DESIGN.md                 methodology + honest caveats
```

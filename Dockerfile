# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# TTS Arena — Cloud Run image.
#
# Multi-stage build on the official Bun image. Produces a Next.js "standalone"
# server (next.config.ts sets `output: 'standalone'`), which bundles only the
# files the server actually needs plus a minimal node_modules. The final image
# carries no build toolchain — just the standalone server + static assets.
#
# Cloud Run injects the PORT env var (defaults to 8080) and expects the
# container to listen on 0.0.0.0:$PORT. The Next.js standalone server reads
# PORT and HOSTNAME directly, so no extra wiring is needed.
# ---------------------------------------------------------------------------

# ---- deps: install all dependencies (incl. dev) for the build -------------
FROM oven/bun:1 AS deps
WORKDIR /app
# Copy only the manifest + lockfile first so this layer caches across source
# edits. --frozen-lockfile fails the build if bun.lock is out of date.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- builder: compile the Next.js standalone bundle -----------------------
FROM oven/bun:1 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` writes the self-contained server to .next/standalone and the
# client assets to .next/static. DATABASE_URL is read at request time (the
# Neon HTTP driver is lazy), so no DB connection is needed during the build.
RUN bun run build

# ---- runner: minimal runtime image ---------------------------------------
FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run sets PORT (default 8080); bind all interfaces so the proxy reaches us.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Run as the non-root user that ships with the Bun image.
USER bun

# The standalone output already includes a pruned node_modules and server.js.
# .next/static and public/ are NOT copied into standalone by Next.js, so copy
# them in explicitly alongside the server.
COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
COPY --from=builder --chown=bun:bun /app/public ./public

EXPOSE 8080

# server.js is the standalone entrypoint Next.js emits at the repo root inside
# .next/standalone. Run it with Bun.
CMD ["bun", "server.js"]

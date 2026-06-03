# ── PEA-PARO frontend (Next.js 16, standalone output) ───────────────────────
# Build context = ./frontend  (see docker-compose.yml).
# NEXT_PUBLIC_API_URL is inlined into the client bundle at BUILD time, so it is
# passed as a build arg (the public origin, e.g. https://<ip>.sslip.io).

# ---- build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Standalone server must bind 0.0.0.0 (not localhost) to be reachable in the container network.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]

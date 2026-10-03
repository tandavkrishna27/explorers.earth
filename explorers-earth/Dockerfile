# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder

WORKDIR /app

# Accept VITE_ variables as build args (these are baked into the JS bundle at build time)
ARG VITE_API_URL
ARG VITE_REST_API_URL
ARG VITE_PUBLIC_ACCESS_TOKEN
ARG VITE_CLARITY_PROJECT_ID
ARG VITE_LOCAL_TUNES_URL

ENV VITE_API_URL=$VITE_API_URL \
    VITE_REST_API_URL=$VITE_REST_API_URL \
    VITE_PUBLIC_ACCESS_TOKEN=$VITE_PUBLIC_ACCESS_TOKEN \
    VITE_CLARITY_PROJECT_ID=$VITE_CLARITY_PROJECT_ID \
    VITE_LOCAL_TUNES_URL=$VITE_LOCAL_TUNES_URL

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --engine-strict

# Copy source and build
# The build script runs generate-static + tsc + vite build
COPY . .
RUN npm run build

# ── Stage 2: Serve with Nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove the default Nginx placeholder config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx config for SPA fallback routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# Canonical images use an explicit target; legacy builder/runner remains available
# until its retirement ticket. No ambient VITE environment files enter this build.
FROM public.ecr.aws/docker/library/node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS platform-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --engine-strict
COPY . .
# Caller supplies the same-source shared contract directory as a named context;
# no backend credentials/dependencies enter the frontend build context.
COPY --from=platform-shared / /tunes/shared/
RUN npm run landing:check && npx tsc -b && npx vite build --config vite.platform.config.ts --mode platform && node scripts/check-music-production-bundle.mjs

FROM platform-builder AS platform-runtime-renderer
ENTRYPOINT ["node", "scripts/render-platform-runtime.mjs"]
CMD ["/run/platform/public-config.json", "/app/dist/index.html", "/runtime-web"]

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS platform-runner
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.platform.conf /etc/nginx/conf.d/default.conf
COPY --from=platform-builder /app/dist /usr/share/nginx/html
# Extract these two reviewed public-only files from this verified web image for
# the pinned Node init process; they are outside nginx's served directory.
COPY --from=platform-builder /app/scripts/render-platform-runtime.mjs /opt/platform-runtime/scripts/render-platform-runtime.mjs
COPY --from=platform-builder /app/src/lib/publicRuntimeContract.ts /opt/platform-runtime/src/lib/publicRuntimeContract.ts
# Runtime outputs must be mounted read-only; absent config prevents nginx start.
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Existing callers without --target retain the legacy image until retirement.
FROM runner AS legacy-default

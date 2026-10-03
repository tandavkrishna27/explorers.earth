FROM public.ecr.aws/docker/library/node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base

# Set working directory here
WORKDIR /app

# Refresh Alpine packages for each image commit, even with a remote build cache.
ARG BUILD_COMMIT
RUN : "$BUILD_COMMIT" && apk upgrade --no-cache
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Tell Puppeteer to skip downloading Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Separate layer for dependencies
FROM base AS deps
COPY auth-runtime/package.json auth-runtime/package-lock.json auth-runtime/index.js auth-runtime/index.d.ts ./auth-runtime/
COPY package.json package-lock.json ./
RUN npm ci --engine-strict

# Keep build and test tooling out of the runtime image.
FROM base AS prod-deps
COPY auth-runtime/package.json auth-runtime/package-lock.json auth-runtime/index.js auth-runtime/index.d.ts ./auth-runtime/
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --engine-strict
# npm retains optional peer tooling here despite --omit=dev. The server runs
# compiled JavaScript, so keep tsx and its older Go-built esbuild out of runner.
RUN rm -rf node_modules/tsx node_modules/.bin/tsx

# Build the application
FROM deps AS builder

COPY . .
RUN npm run build:api

# Production image
FROM base AS runner
ENV NODE_ENV=production
# The service only needs the Node runtime; do not ship npm's package-management
# dependency graph in the production attack surface.
RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
ARG BUILD_COMMIT
ARG BUILD_SOURCE
LABEL org.opencontainers.image.revision=$BUILD_COMMIT \
      org.opencontainers.image.source=$BUILD_SOURCE \
      com.explorers.music.minimum-containment-commit="d226f7e4dc5a54195a59804ec729f72b5e8f10d7" \
      org.opencontainers.image.title="explorers-tunes"

# Copy production dependencies and build output
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/auth-runtime ./auth-runtime
COPY --from=builder /app/dist ./dist

# Copy necessary config files
COPY package.json ./
COPY drizzle.config.ts ./
COPY shared ./shared
COPY migrations ./migrations

# Expose application port
EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Set the default command
CMD ["node", "dist/server/api.js"]

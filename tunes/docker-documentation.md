# Docker Deployment for Cosmic

## 🐳 Docker Deployment

### Prerequisites
- Docker ([Install Docker](https://docs.docker.com/get-docker/))
- Docker Compose ([Install Docker Compose](https://docs.docker.com/compose/install/))

### Docker Configuration

1. **Create a Dockerfile in the project root**

```dockerfile
FROM node:22.12-alpine AS base

# Set working directory
WORKDIR /app

# Separate layer for dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build the application
FROM deps AS builder
COPY . .
RUN npm run build

# Production image
FROM base AS runner
ENV NODE_ENV=production

# Copy production dependencies and build output
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Copy necessary config files
COPY package.json ./
COPY drizzle.config.ts ./

# Expose application port
EXPOSE 5000

# Set the default command
CMD ["node", "dist/server/index.js"]
```

This example reflects the supported Node 22.12 minimum. Release builds use the
repository's checked-in `tunes/Dockerfile`, immutable base-image digest, and
`.github/workflows/tunes.yml`; do not build or promote a production image from
this illustrative snippet.

2. **Create a Docker Compose file**

```yaml
version: "3.8"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - SESSION_SECRET=${SESSION_SECRET}
      - COOKIE_SECRET=${COOKIE_SECRET}
      - EMAIL_HOST=${EMAIL_HOST}
      - EMAIL_PORT=${EMAIL_PORT}
      - EMAIL_USER=${EMAIL_USER}
      - EMAIL_PASS=${EMAIL_PASS}
      - EMAIL_FROM=${EMAIL_FROM}
      - YOUTUBE_API_KEY=${YOUTUBE_API_KEY}
      - CLARITY_PROJECT_ID=${CLARITY_PROJECT_ID}
    depends_on:
      - db
    restart: unless-stopped
    networks:
      - cosmic-network

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=${DB_USER:-cosmic}
      - POSTGRES_PASSWORD=${DB_PASS:-cosmicpass}
      - POSTGRES_DB=${DB_NAME:-cosmic}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped
    networks:
      - cosmic-network

networks:
  cosmic-network:
    driver: bridge

volumes:
  postgres-data:
```

3. **Create a .dockerignore file**

```
node_modules
npm-debug.log
.git
.github
.env
.env.example
.vscode
*.md
.gitignore
```

### Building and Running with Docker

1. **Build the Docker image**

```bash
# Build using Docker Compose
docker-compose build
```

2. **Run the application with Docker Compose**

```bash
# Create a .env file with your environment variables first
cp .env.example .env
# Edit .env with your values

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
```

3. **Access the Dockerized application**
   - Application: `http://localhost:5000`

### Production authority

The Compose example above is for local orientation only. Production images are
built once by `.github/workflows/tunes.yml` from the checked-in digest-pinned
`tunes/Dockerfile`, scanned and attested at the exact commit, and promoted by
immutable GHCR digest through the protected deployment workflow. Follow the
[Music immutable deployment runbook](../docs/operations/music-deploy-runbook.md);
do not build locally, publish a mutable tag, or treat this example as deployment
authority.

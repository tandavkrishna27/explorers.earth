# explorers-earth — Deployment

## Build Process

```bash
# Production build
npm run build
# Runs: npm run generate-static && tsc -b && vite build
```

Build steps:
1. **generate-static** — Generates static files (e.g., sitemap, robots.txt) via `scripts/generate-static-files.js`
2. **tsc -b** — TypeScript type checking
3. **vite build** — Produces optimized static assets in `dist/`

### Preview locally

```bash
npm run preview
# Starts a local server serving the production build
```

## Netlify Deployment

The app is configured for Netlify deployment via `netlify.toml`.

### Configuration

```toml
# netlify.toml
[[redirects]]
  from = "/graphql"
  to = "https://api-qa.explorers.earth/graphql"
  status = 200

[[redirects]]
  from = "/*"
  to = "/"
  status = 200
```

**Key redirects**:
- `/graphql` → Proxied to the Strapi CMS GraphQL endpoint (avoids CORS issues)
- `/*` → Falls back to `/` for client-side routing (SPA pattern)

### Netlify Build Settings

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Publish directory | `dist/` |
| Node version | 24.21.0 (24.x) |

### Environment Variables

Set these in the Netlify dashboard (Site settings > Environment variables):

- `VITE_API_URL` — GraphQL API endpoint
- `VITE_REST_API_URL` — REST API endpoint
- `VITE_GOOGLE_MAPS_API_KEY` — Google Maps key
- All other `VITE_*` variables as needed

See [Environment Variables](../environment-variables.md) for the complete list.

## Production Considerations

### Performance
- Vite produces optimized, code-split bundles
- Route-based lazy loading for reduced initial bundle size
- Images are compressed before upload
- Apollo Client provides intelligent data caching

### DNS
- Configure custom domain in Netlify domain settings
- SSL/TLS is automatically provisioned by Netlify

### Staging vs Production
- Use separate Netlify sites for staging and production
- Point each to different Strapi CMS instances via `VITE_API_URL`
- Use Netlify deploy previews for PR review

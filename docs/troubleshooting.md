# Troubleshooting

## Common Issues

### Port Conflicts

**Symptom**: "Port 5000 already in use" or "Port 5173 already in use"

**Fix**:
```bash
# Find what's using the port
# On Mac/Linux:
lsof -i :5000
# On Windows:
netstat -ano | findstr :5000

# Kill the process or use a different port
# tunes: set PORT env var
# explorers-earth: modify vite.config.ts server.port
```

### Database Connection Failed (tunes)

**Symptom**: "Connection refused" or "ECONNREFUSED" on startup

**Checklist**:
1. Is PostgreSQL running? (`pg_isready` or check service status)
2. Is `DATABASE_URL` set correctly in `tunes/.env`?
3. Does the database exist? (`createdb tunes` if not)
4. Can you connect manually? (`psql $DATABASE_URL`)
5. For Neon (cloud): check that the connection string includes `?sslmode=require`

### Fixture Migration Fails (tunes)

**Symptom**: `npm run music:db:migrate -- --mode fixture --target test` fails with errors

**Common causes**:
- Bootstrap has not created the disposable Compose database — run `npm run music:bootstrap -- --mode fixture`
- `DATABASE_URL_TEST` does not resolve exactly to `music_migrator@127.0.0.1:55432/music_fixture` — remove the conflicting override and rerun bootstrap
- The migration journal, checksum, or catalog differs from the reviewed chain — do not force it; run `npm run music:db:verify -- --mode fixture --target test` and inspect the typed recovery action

### Missing Environment Variables

**Symptom**: Features don't work, blank screens, or API errors

**Fix**: Compare your `.env` files against [Environment Variables](environment-variables.md). Key variables that cause visible failures:
- Missing `VITE_API_URL` → explorers-earth can't load data
- Missing `DATABASE_URL` → tunes won't start
- Missing `SESSION_SECRET` → tunes session errors
- Missing `YOUTUBE_API_KEY` → Song search returns empty
- Missing `VITE_GOOGLE_MAPS_API_KEY` → Maps don't render

### Google Maps Not Rendering (explorers-earth)

**Symptom**: Map area is blank or shows "For development purposes only"

**Fix**:
1. Check `VITE_GOOGLE_MAPS_API_KEY` is set
2. Ensure Maps JavaScript API is enabled in Google Cloud Console
3. Check API key restrictions (HTTP referrers must include localhost for dev)
4. "For development purposes only" = billing not enabled on Google Cloud project

### WebSocket Connection Issues (tunes)

**Symptom**: "Disconnected" status, real-time updates not working

**Checklist**:
1. Is the tunes server running?
2. Check browser console for WebSocket errors
3. CORS issues? Ensure the server allows the client's origin
4. Proxy issues? WebSocket upgrades may fail through some proxies
5. Check `connection-status.tsx` component for visual status indicator

### Build Failures

**Symptom**: `npm run build` fails

**Common causes**:
- TypeScript errors — run `npm run check` (tunes) or `npx tsc -b` (explorers-earth) to see details
- Missing dependencies — run `npm install` in the affected directory
- Node version mismatch — ensure Node.js 24.21.0 (24.x)

### Authentication Issues (tunes)

**Symptom**: Login succeeds but immediately redirected back to login

**Checklist**:
1. Is `SESSION_SECRET` set in `tunes/.env`?
2. Cookie settings — in development, `secure: false` should be set
3. CORS — credentials must be included in fetch requests
4. Session store — check PostgreSQL `session` table for active sessions

### Authentication Issues (explorers-earth)

**Symptom**: Login fails or app shows blank after login

**Checklist**:
1. Is the Strapi CMS backend running and accessible?
2. Is `VITE_API_URL` pointing to the correct GraphQL endpoint?
3. Check browser localStorage for JWT token
4. Check browser console for GraphQL errors

### `npm run dev` Fails at Root

**Symptom**: One or both apps fail to start when running `npm run dev` from root

**Fix**:
1. Run `npm run install:all` first
2. Check that both `tunes/.env` and `explorers-earth/.env` exist
3. For tunes: ensure PostgreSQL is running
4. Try running apps individually to isolate which one fails:
   ```bash
   npm run dev:tunes
   npm run dev:explorers-earth
   ```

### Regional Statistics Map Not Showing All Users (tunes Admin)

**Symptom**: Admin dashboard map shows fewer venues than total count

**Cause**: Only users with valid `countryCode` in `user_sessions` appear on the map. Users without session data show as "Unknown" region.

**This is expected behavior** — users without geolocation data are counted in the "Unknown" category.

### Public Music is stale or reconnecting

Filter operational logs by `version = music-public-ops/v1`; use the browser
stream `music-public-browser-ops/v1` only for client/parser and fallback-poll
diagnosis. Compare low-cardinality `event`, `outcome`, `operation`, `status`,
`kind`, `role`, and bounded duration fields. A validated support reference can
be matched to backend `requestId`. Never request or paste a public slug,
capability, Account/User identifier, raw search, media URL, credential, IP
address, or socket room into a ticket or query.

Check in order: HTTP 5xx and parser rejection, listener reconnect/fatal events,
socket admission/disconnect churn, notification fanout lag, then fallback poll
activation. Revocation enforcement is expected after a permission/publication
change; missing enforcement or cross-owner delivery requires containment.

### Public Music fixture cleanup failed

Do not rerun an authorized live-write lane after a restoration mismatch. Keep
the sanitized recovery artifact, compare its normalized `beforeHash` and
`afterHash`, and inspect only namespaced `e2e-public-music-<run>` records. Never
delete an unnamespaced playlist/account to force the comparison green. PR-safe
and mocked lanes remain usable because they cannot acquire write authority.

## Getting Help

If your issue isn't listed here:
1. Check the browser console for error messages
2. Check the server terminal output for backend errors
3. Search existing issues in the repository
4. Ask in the team communication channel

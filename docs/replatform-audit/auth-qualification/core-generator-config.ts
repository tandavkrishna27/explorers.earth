import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
export const auth = betterAuth({
  baseURL: 'http://localhost:3999',
  secret: randomBytes(48).toString('base64'),
  database: drizzleAdapter(drizzle(new Pool({ connectionString: 'postgresql://probe:local-probe-only@127.0.0.1:52108/auth_probe' })), { provider: 'pg' }),
  user: { modelName: 'auth_user' },
  session: { modelName: 'auth_session' },
  account: { modelName: 'auth_account' },
  verification: { modelName: 'auth_verification' },
  socialProviders: { google: { clientId: 'qualification-placeholder', clientSecret: 'qualification-placeholder' } },
  emailAndPassword: { enabled: false }
});

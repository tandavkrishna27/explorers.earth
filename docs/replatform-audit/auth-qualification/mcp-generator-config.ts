import { jwt } from 'better-auth/plugins';
import { mcp } from '@better-auth/mcp';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
export const auth = betterAuth({
  baseURL: 'http://localhost:3999',
  secret: randomBytes(48).toString('base64'),
  user: { modelName: 'auth_user' },
  session: { modelName: 'auth_session' },
  account: { modelName: 'auth_account' },
  verification: { modelName: 'auth_verification' },
  socialProviders: { google: { clientId: 'qualification-placeholder', clientSecret: 'qualification-placeholder' } },
  emailAndPassword: { enabled: false },
  plugins: [jwt(), mcp({loginPage: "/sign-in", consentPage: "/consent", resource: "http://localhost:3999/mcp"}), cimd({fetchClientMetadataResource,metadataProfile:"mcp-2026-07-28"})]
});
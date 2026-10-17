import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { mcp } from '@better-auth/mcp';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './generated-auth-mcp.ts';
const pool=new Pool({connectionString:'postgresql://probe:local-probe-only@127.0.0.1:52108/auth_mcp_probe'});
const results=[];
try {
 const auth=betterAuth({baseURL:'http://localhost:3999',secret:randomBytes(48).toString('base64'),database:drizzleAdapter(drizzle(pool,{schema}),{provider:'pg',schema}),user:{modelName:'auth_user'},session:{modelName:'auth_session'},account:{modelName:'auth_account'},verification:{modelName:'auth_verification'},emailAndPassword:{enabled:false},socialProviders:{google:{clientId:'qualification-placeholder',clientSecret:'qualification-placeholder'}},plugins:[jwt(),mcp({loginPage:'/sign-in',consentPage:'/consent',resource:'http://localhost:3999/mcp'}),cimd({fetchClientMetadataResource,metadataProfile:'mcp-2026-07-28'})]});
 await auth.$context;results.push('MCP/JWT/CIMD composition initializes with generated PostgreSQL schema');
 const columns=(await pool.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 assert.equal(new Set(columns.map(c=>c.table_name)).size,12);results.push('catalog has 12 generated tables');
 const resource=await pool.query('SELECT * FROM oauth_resource');assert.equal(resource.rows.length,1);results.push('plugin registers one canonical OAuth resource');
 for (const url of ['http://localhost:3999/.well-known/oauth-authorization-server/api/auth','http://localhost:3999/.well-known/oauth-protected-resource/mcp']) {
  const response=await auth.handler(new Request(url));assert.equal(response.status,200,url);
  const body=await response.json();assert.ok(body.issuer || body.resource);results.push('discovery metadata returns 200: '+new URL(url).pathname);
 }
 writeFileSync('mcp-probe-results.json',JSON.stringify({passed:results.length,results,columns},null,2));
 console.log(JSON.stringify({passed:results.length,results},null,2));
} finally {await pool.end();}

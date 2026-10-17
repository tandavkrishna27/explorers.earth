/**
 * Account Reactivation Service
 *
 * Handles the self-service account reactivation flow:
 *  1. User requests reactivation → token generated + email sent
 *  2. User clicks link → token validated → Strapi `blocked` set to false
 *
 * This service is completely standalone. It reuses:
 *  - emailService (existing AWS SES email service)
 *  - systemSettingsService (existing base URL resolution)
 *  - STRAPI_URL + STRAPI_ACCESS_TOKEN env vars (already used by strapiService)
 *
 * It does NOT modify any existing service or route.
 */

import crypto from 'crypto';
import { emailService } from './email-service';
import { systemSettingsService } from './system-settings-service';
import { storage } from '../storage';
import type { MusicIdentityRepository } from '../repositories/musicIdentityRepository';
import { cancelResponseBody, readBoundedResponseBody } from './upstreamResponseBody';

// ─── Reactivation email template (self-seeding) ───────────────────────────────

const REACTIVATION_TEMPLATE_NAME = 'account_reactivation';

/**
 * Returns the ID of the reactivation email template.
 * If the template doesn't exist in the database yet, it is created automatically.
 * This means no manual setup is ever required.
 */
async function getOrCreateReactivationTemplate(): Promise<number> {
  // Try to find existing template by name
  const existing = await storage.getEmailTemplateByName(REACTIVATION_TEMPLATE_NAME);
  if (existing) {
    return existing.id;
  }

  console.log('📧 Creating reactivation email template for the first time...');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reactivate Your Account</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .container { max-width: 600px; margin: 40px auto; background-color: #111827; border-radius: 16px; overflow: hidden; border: 1px solid #1f2937; }
    .header { background: linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%); padding: 40px 32px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px; }
    .body { padding: 40px 32px; }
    .body p { color: #d1d5db; line-height: 1.7; font-size: 15px; margin: 0 0 16px; }
    .body .greeting { color: #f9fafb; font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    .btn-wrapper { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%); color: #ffffff !important; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px; }
    .note { background-color: #1f2937; border-left: 4px solid #1d4ed8; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 24px 0; }
    .note p { color: #9ca3af; font-size: 13px; margin: 0; }
    .footer { text-align: center; padding: 24px 32px; border-top: 1px solid #1f2937; }
    .footer p { color: #4b5563; font-size: 12px; margin: 4px 0; }
    .url-fallback { word-break: break-all; color: #60a5fa; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔓 Reactivate Your Account</h1>
      <p>explorers.earth</p>
    </div>
    <div class="body">
      <p class="greeting">Hi {{username}},</p>
      <p>We received a request to reactivate your explorers account. Click the button below to restore access — this link expires in <strong style="color:#f9fafb;">24 hours</strong>.</p>
      <div class="btn-wrapper">
        <a href="{{verificationLink}}" class="btn">Reactivate My Account</a>
      </div>
      <div class="note">
        <p>If you didn't request this, you can safely ignore this email. Your account will remain deactivated.</p>
      </div>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p class="url-fallback">{{verificationLink}}</p>
    </div>
    <div class="footer">
      <p>© {{currentYear}} explorers.earth — All rights reserved</p>
      <p>This is an automated email, please do not reply.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi {{username}},

We received a request to reactivate your explorers account.

Click the link below to reactivate your account (expires in 24 hours):
{{verificationLink}}

If you didn't request this, you can safely ignore this email.

© {{currentYear}} explorers.earth`;

  const created = await storage.createEmailTemplate({
    name: REACTIVATION_TEMPLATE_NAME,
    subject: 'Reactivate your Explorers account',
    html_content: html,
    text_content: text,
    variables: { username: '', verificationLink: '', currentYear: '' },
    isActive: true,
  });

  console.log(`✅ Reactivation email template created with ID: ${created.id}`);
  return created.id;
}


export type ReactivationTokenAuthority = Pick<MusicIdentityRepository,
  "issueReactivationToken" | "claimReactivationToken" | "releaseReactivationToken"
  | "consumeReactivationToken" | "revokeReactivationToken">;

interface ReactivationRequestDependencies { tokens: ReactivationTokenAuthority }
interface ReactivationConfirmDependencies extends ReactivationRequestDependencies {
  reactivateMusic(input: { userDocumentId: string; accountDocumentId: string; operationId: string }): Promise<void>;
}

const STRAPI_CONNECT_TIMEOUT_MS = 2_000;
const STRAPI_READ_TIMEOUT_MS = 4_000;
const STRAPI_OVERALL_TIMEOUT_MS = 7_000;
const STRAPI_MAX_BODY_BYTES = 64 * 1024;

// ─── Strapi REST helpers ───────────────────────────────────────────────────────

interface StrapiUser {
  id: number;
  documentId: string;
  username: string;
  email: string;
  blocked: boolean;
  confirmed: boolean;
  accounts?: Array<{ documentId?: string }>;
}

/**
 * Look up a Strapi user by email using the admin REST API.
 * Returns null if not found or not blocked.
 */
async function findBlockedUserByEmail(email: string): Promise<StrapiUser | null> {
  const value = await requestStrapiJson(`/api/users?filters[email][$eq]=${encodeURIComponent(email)}&filters[blocked][$eq]=true&populate=accounts`);
  if (!Array.isArray(value) || value.length !== 1) return null;
  return validStrapiUser(value[0]) ? value[0] : null;
}

async function resolveCurrentReactivationIdentity(userId: number): Promise<StrapiUser | null> {
  if (!Number.isSafeInteger(userId) || userId < 1) return null;
  try {
    const value = await requestStrapiJson(`/api/users/${userId}?populate=accounts`);
    if (!validStrapiUser(value)) return null;
    const candidate = value;
    if (candidate.id !== userId || typeof candidate.documentId !== 'string' || candidate.documentId.length === 0
        || typeof candidate.blocked !== 'boolean' || !Array.isArray(candidate.accounts)
        || candidate.accounts.length !== 1 || typeof candidate.accounts[0]?.documentId !== 'string'
        || candidate.accounts[0].documentId.length === 0) return null;
    return candidate as StrapiUser;
  } catch {
    return null;
  }
}

/**
 * Set blocked = false on a Strapi user by their numeric ID.
 */
async function unblockStrapiUser(expected: {
  id: number;
  documentId: string;
  accountDocumentId: string;
}): Promise<boolean> {
  try {
    const value = await requestStrapiJson(`/api/users/${expected.id}`, {
      method: 'PUT',
      body: JSON.stringify({ blocked: false }),
    });
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const candidate = value as Partial<StrapiUser>;
    if (candidate.id !== expected.id || candidate.documentId !== expected.documentId || candidate.blocked !== false) return false;
    if (candidate.accounts !== undefined) {
      if (!Array.isArray(candidate.accounts) || candidate.accounts.length !== 1
          || candidate.accounts[0]?.documentId !== expected.accountDocumentId) return false;
    } else {
      const readback = await resolveCurrentReactivationIdentity(expected.id);
      if (!readback || readback.documentId !== expected.documentId || readback.blocked !== false
          || readback.accounts?.[0]?.documentId !== expected.accountDocumentId) return false;
    }
  } catch {
    return false;
  }

  console.log('reactivation_strapi_unblock_succeeded');
  return true;
}

function validStrapiUser(value: unknown): value is StrapiUser {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<StrapiUser>;
  return Number.isSafeInteger(candidate.id) && Number(candidate.id) > 0
    && typeof candidate.documentId === 'string' && candidate.documentId.length > 0 && candidate.documentId.length <= 512
    && typeof candidate.username === 'string' && candidate.username.length > 0 && candidate.username.length <= 512
    && typeof candidate.email === 'string' && candidate.email.length > 0 && candidate.email.length <= 320
    && typeof candidate.blocked === 'boolean' && typeof candidate.confirmed === 'boolean'
    && Array.isArray(candidate.accounts) && candidate.accounts.length <= 50;
}

async function requestStrapiJson(path: string, init: Pick<RequestInit, 'method' | 'body'> = {}): Promise<unknown> {
  const token = process.env.STRAPI_ACCESS_TOKEN;
  let origin: URL;
  try { origin = new URL(process.env.STRAPI_URL ?? ''); }
  catch { throw new Error('reactivation Strapi authority is unavailable'); }
  if (!token || !['http:', 'https:'].includes(origin.protocol) || origin.origin !== origin.href.replace(/\/$/, '')
      || origin.username || origin.password) {
    throw new Error('reactivation Strapi authority is unavailable');
  }
  const endpoint = new URL(path, origin);
  if (endpoint.origin !== origin.origin) throw new Error('reactivation Strapi authority is unavailable');
  const controller = new AbortController();
  const overall = setTimeout(() => controller.abort(), STRAPI_OVERALL_TIMEOUT_MS);
  overall.unref?.();
  try {
    let connectTimer: NodeJS.Timeout | undefined;
    const response = await Promise.race([
      fetch(endpoint, {
        ...init,
        redirect: 'manual',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        signal: controller.signal,
      }),
      new Promise<Response>((_, reject) => {
        connectTimer = setTimeout(() => {
          controller.abort();
          reject(new Error('reactivation Strapi connect timeout'));
        }, STRAPI_CONNECT_TIMEOUT_MS);
        connectTimer.unref?.();
      }),
    ]).finally(() => { if (connectTimer) clearTimeout(connectTimer); });
    if ((response.url && new URL(response.url).origin !== origin.origin) || response.status < 200 || response.status >= 300) {
      await cancelResponseBody(response);
      throw new Error('reactivation Strapi request failed');
    }
    const body = await readBoundedResponseBody(response, STRAPI_MAX_BODY_BYTES, STRAPI_READ_TIMEOUT_MS, controller);
    return JSON.parse(body);
  } finally {
    clearTimeout(overall);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Step 1: Request reactivation.
 *
 * Always returns a generic success to avoid leaking whether an email exists.
 * If the email belongs to a blocked user, a token is generated and a
 * reactivation link is emailed to them.
 */
export async function requestReactivation(email: string, dependencies: ReactivationRequestDependencies): Promise<void> {
  let tokenHash: string | undefined;
  try {
    const user = await findBlockedUserByEmail(email);
    if (!user) {
      // No blocked user with this email — do nothing (security: don't reveal)
      console.log('reactivation_blocked_identity_not_found');
      return;
    }
    if (typeof user.documentId !== 'string' || user.documentId.length === 0
        || !Array.isArray(user.accounts) || user.accounts.length !== 1
        || typeof user.accounts[0]?.documentId !== 'string' || user.accounts[0].documentId.length === 0) {
      console.error('reactivation_identity_binding_invalid');
      return;
    }

    // Generate a secure random token (same approach as email-service)
    const token = crypto.randomBytes(32).toString('hex');
    tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    await dependencies.tokens.issueReactivationToken({
      tokenHash,
      strapiUserId: user.id,
      userDocumentId: user.documentId,
      accountDocumentId: user.accounts[0].documentId,
      operationId: crypto.randomUUID(),
    });

    // Build the reactivation link using the existing base URL resolution
    const baseUrl = await systemSettingsService.getAppUrl();
    const reactivationLink = `${baseUrl}/reactivate-confirm?token=${token}`;

    // Get or auto-create the reactivation email template in the tunes DB.
    // This is self-seeding — no manual setup required.
    const templateId = await getOrCreateReactivationTemplate();

    // Send the email via the existing email service
    const result = await emailService.sendEmail(
      user.email,
      templateId,
      {
        username: user.username,
        verificationLink: reactivationLink,
        currentYear: new Date().getFullYear().toString(),
      },
      undefined,
      'Reactivate your Explorers account'
    );

    if (!result.success) {
      await dependencies.tokens.revokeReactivationToken(tokenHash);
      console.error('reactivation_email_delivery_failed');
    } else {
      console.log('reactivation_email_delivery_succeeded');
    }
  } catch {
    if (tokenHash) await dependencies.tokens.revokeReactivationToken(tokenHash).catch(() => undefined);
    console.error('reactivation_request_suppressed_failure');
  }
}

/**
 * Step 2: Confirm reactivation via token.
 *
 * Validates the token and sets blocked = false via Strapi REST API.
 * Returns a result object so the route can respond appropriately.
 */
export async function confirmReactivation(
  token: string,
  dependencies: ReactivationConfirmDependencies,
): Promise<{ success: boolean; error?: string }> {
  if (!token) {
    return { success: false, error: 'Token is required' };
  }

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return { success: false, error: 'Invalid or already used reactivation link' };
  }
  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const leaseOwner = crypto.randomUUID();
  const entry = await dependencies.tokens.claimReactivationToken(tokenHash, leaseOwner);
  if (entry.disposition === 'expired') {
    return { success: false, error: 'Reactivation link has expired. Please request a new one.' };
  }
  if (entry.disposition !== 'claimed') {
    return { success: false, error: 'Invalid or already used reactivation link' };
  }
  const release = async () => { await dependencies.tokens.releaseReactivationToken(tokenHash, leaseOwner).catch(() => undefined); };
  const userId = entry.strapiUserId;
  const current = await resolveCurrentReactivationIdentity(userId);
  if (!current || current.documentId !== entry.userDocumentId
      || current.accounts?.[0]?.documentId !== entry.accountDocumentId) {
    await release();
    return { success: false, error: 'Failed to verify the current account identity. Please request a new link.' };
  }
  try {
    await dependencies.reactivateMusic({
      userDocumentId: entry.userDocumentId,
      accountDocumentId: entry.accountDocumentId,
      operationId: entry.operationId,
    });
  } catch {
    await release();
    return { success: false, error: 'Failed to reactivate account. Please try again.' };
  }
  const unblocked = current.blocked === false || await unblockStrapiUser({
    id: userId,
    documentId: entry.userDocumentId,
    accountDocumentId: entry.accountDocumentId,
  });

  if (!unblocked) {
    await release();
    return { success: false, error: 'Failed to reactivate account. Please try again.' };
  }
  return await dependencies.tokens.consumeReactivationToken(tokenHash, leaseOwner)
    ? { success: true }
    : { success: false, error: 'Failed to reactivate account. Please try again.' };
}

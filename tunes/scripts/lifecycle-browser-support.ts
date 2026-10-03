import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Pool } from 'pg';
import type { createCanonicalApp } from '../server/auth/canonicalApp';
import type { ExplorersAuthConfig } from '../server/auth/betterAuth';
import { ensureInitialAccount } from '../server/auth/initialAccount';
import { runAccountLifecycleMaintenance } from '../server/application/accountLifecycleMaintenance';
import { LocalObjectStorage } from '../server/services/objectStorage';
import { validateLifecycleControl, assertProviderCode } from './lifecycle-browser-guards';
/** Private Node control plane. Never mounted in canonicalApp or sent to page scripts. */
export async function startLifecycleControl(pool: Pool, composed: ReturnType<typeof createCanonicalApp>, config: ExplorersAuthConfig, port: number) {
    const capability = randomBytes(32).toString('hex'), host = `127.0.0.1:${port}`;
    type Owner = {
        userId: string;
        accountId: string;
        handle: string;
        subject: string;
        email: string;
        cookie: string;
    };
    let active: {
        caseId: string;
        owners: Owner[];
        selected: number;
        wrongSubject: boolean;
        callbackCode: string;
    } | undefined;
    const authContext = await composed.auth.$context;
    const google = authContext.socialProviders.find(p => p.id === 'google');
    if (!google)
        throw new Error('Owned Google provider seam missing');
    const originalValidate = google.validateAuthorizationCode, originalUser = google.getUserInfo;
    google.validateAuthorizationCode = async (input) => {
        assertProviderCode(input.code, active?.callbackCode);
        return { accessToken: 'fixture-only', tokenType: 'Bearer' };
    };
    google.getUserInfo = async () => {
        if (!active)
            throw new Error('Provider scenario missing');
        const owner = active.owners[active.selected], subject = active.wrongSubject ? `wrong-${owner.subject}` : owner.subject;
        return { user: { name: 'Owned lifecycle', email: owner.email, emailVerified: true }, data: { sub: subject, email: owner.email, email_verified: true, name: 'Owned lifecycle' } };
    };
    async function owner(): Promise<Owner> {
        const userId = `lifecycle-browser-${randomUUID()}`, subject = `google-${userId}`, email = `${userId}@example.invalid`, handle = `life${randomBytes(8).toString('hex')}`;
        await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Owned lifecycle',$2)", [userId, email]);
        await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())", [randomUUID(), subject, userId]);
        const { accountId } = await ensureInitialAccount(pool, userId);
        await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Owned lifecycle',onboarding_status='complete',account_type='Personal' WHERE id=$1", [accountId, handle]);
        const session = await authContext.internalAdapter.createSession(userId, false);
        const signature = createHmac('sha256', config.secret).update(session.token).digest('base64');
        return { userId, subject, email, accountId, handle, cookie: `${authContext.authCookies.sessionToken.name}=${session.token}.${signature}` };
    }
    const server = createServer(async (req, res) => {
        try {
            if (req.method !== 'POST' || req.url !== '/control')
                throw new Error('Control route mismatch');
            let bytes = '';
            for await (const chunk of req) {
                bytes += chunk;
                if (bytes.length > 4096)
                    throw new Error('Control request too large');
            }
            const body = JSON.parse(bytes);
            validateLifecycleControl({ remote: req.socket.remoteAddress ?? '', host: req.headers.host ?? '', expectedHost: host, capability: String(req.headers['x-lifecycle-capability'] ?? ''), expectedCapability: capability, caseId: body.caseId, action: body.action });
            if (Object.keys(body).some(key => !['caseId', 'action', 'owner', 'wrongSubject'].includes(key)))
                throw new Error('Unknown control input');
            if (body.action === 'prepare') {
                active = { caseId: body.caseId, owners: [await owner(), await owner()], selected: 0, wrongSubject: false, callbackCode: randomBytes(24).toString('hex') };
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ owners: active.owners.map(({ subject, email, ...safe }) => safe), callbackCode: active.callbackCode }));
                return;
            }
            if (!active || active.caseId !== body.caseId)
                throw new Error('Inactive lifecycle scenario');
            const index = body.owner ?? 0;
            if (index !== 0 && index !== 1)
                throw new Error('Unknown owned identity');
            const selected = active.owners[index];
            if (body.action === 'provider') {
                if (body.wrongSubject !== undefined && typeof body.wrongSubject !== 'boolean')
                    throw new Error('Invalid provider selection');
                active.selected = index;
                active.wrongSubject = body.wrongSubject === true;
            }
            if (body.action === 'expire')
                await pool.query("UPDATE account_recovery_proofs SET issued_at=issued_at-interval '6 minutes',expires_at=expires_at-interval '6 minutes' WHERE user_id=$1", [selected.userId]);
            if (body.action === 'bump')
                await pool.query('UPDATE creator_accounts SET revision=revision+1 WHERE id=$1', [selected.accountId]);
            if (body.action === 'terminal') {
                const status = await pool.query('SELECT status FROM creator_accounts WHERE id=$1', [selected.accountId]);
                if (status.rows[0]?.status !== 'pending_deletion')
                    throw new Error('Terminal requires actual pending deletion');
                await runAccountLifecycleMaintenance(pool, new LocalObjectStorage());
            }
            const account = await pool.query('SELECT id,status,revision::int,onboarding_status FROM creator_accounts WHERE id=$1', [selected.accountId]);
            const security = await pool.query('SELECT blocked_at IS NOT NULL AS blocked,session_version::int FROM user_security_state WHERE user_id=$1', [selected.userId]);
            const feedback = await pool.query('SELECT id,reason FROM deletion_feedback WHERE account_id=$1 ORDER BY created_at,id', [selected.accountId]);
            const operations = await pool.query('SELECT kind,state FROM account_lifecycle_operations WHERE account_id=$1 ORDER BY created_at,id', [selected.accountId]);
            const counts = await pool.query(`SELECT (SELECT count(*)::int FROM auth_session WHERE user_id=$1) sessions,
    (SELECT count(*)::int FROM account_recovery_proofs WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp()) proofs,
    (SELECT count(*)::int FROM initial_account_bindings WHERE user_id=$1) bindings,
    (SELECT count(*)::int FROM collections WHERE account_id=$2) collections`, [selected.userId, selected.accountId]);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ account: account.rows[0], security: security.rows[0], feedback: feedback.rows, operations: operations.rows, ...counts.rows[0] }));
        }
        catch {
            res.statusCode = 403;
            res.end('{"error":"owned lifecycle control denied"}');
        }
    });
    await new Promise<void>(done => server.listen(port, '127.0.0.1', done));
    return { url: `http://${host}/control`, capability, close: async () => { google.validateAuthorizationCode = originalValidate; google.getUserInfo = originalUser; await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); } };
}

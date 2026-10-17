import type { Pool } from 'pg';
/** Independent bounded maintenance for every server accepting canonical telemetry. */
export function startAnalyticsMaintenance(pool: Pick<Pool, 'query'>, onFailure: () => void = () => { process.stderr.write('Analytics retention failed; retry is scheduled\n'); }): () => Promise<void> {
    let active: Promise<void> | undefined, stopped = false;
    const maintain = () => { if (stopped || active)
        return; active = pool.query('SELECT purge_expired_analytics_events(100)').then(() => undefined).catch(() => { onFailure(); }).finally(() => { active = undefined; }); };
    maintain();
    const timer = setInterval(maintain, 60000);
    timer.unref();
    return async () => { stopped = true; clearInterval(timer); await active; };
}

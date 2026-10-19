import { describe, expect, it } from 'vitest';
import { installOutboundMonitor, selfTestOutboundMonitor } from '../../../scripts/no-strapi-outbound-monitor';

describe('no-Strapi outbound monitor', () => {
  it('sees a fetch and an http.request to a poisoned host, and reports them as Strapi', async () => {
    const monitor = installOutboundMonitor();
    try {
      await selfTestOutboundMonitor(monitor);
      expect(monitor.strapi()).toEqual([]); // only this run's self-test nonces are exempt
      await fetch('https://strapi.poison.invalid/graphql').catch(() => undefined);
      expect(monitor.strapi().map((o) => o.origin)).toContain('https://strapi.poison.invalid');
      // An app request that merely carries the parameter is still a violation.
      await fetch('https://strapi.poison.invalid/x?nostrapi-selftest=forged').catch(() => undefined);
      expect(monitor.strapi().some((o) => o.path.includes('forged'))).toBe(true);
    } finally {
      monitor.dispose();
    }
  });

  it('is blind after dispose, so a disposed monitor cannot report a clean run', async () => {
    const monitor = installOutboundMonitor();
    monitor.dispose();
    await expect(selfTestOutboundMonitor(monitor)).rejects.toThrow('NO_STRAPI_OUTBOUND_MONITOR_BLIND');
  });
});

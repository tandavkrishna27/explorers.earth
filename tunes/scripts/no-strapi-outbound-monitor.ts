import diagnostics_channel from 'node:diagnostics_channel';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

export type OutboundObservation = { channel: 'undici' | 'http'; origin: string; path: string };
export type OutboundMonitor = {
  seen: OutboundObservation[];
  strapi(): OutboundObservation[];
  dispose(): void;
};

/** Hosts, ports and paths that can only mean Strapi. Kept in step with no-strapi-monitor.ts. */
const STRAPI = /strapi|localqr|:1337(?:\/|$)|77\.42\.95\.255|13\.126\.235\.177/i;
const SELF_TEST = 'nostrapi-selftest=';
/** Only nonces this process issued are exempt; an app request carrying the parameter is still a violation. */
const issued = new Set<string>();

export function installOutboundMonitor(): OutboundMonitor {
  const seen: OutboundObservation[] = [];
  const onUndici = (message: unknown) => {
    const request = (message as { request: { origin: unknown; path: unknown } }).request;
    seen.push({ channel: 'undici', origin: String(request.origin), path: String(request.path) });
  };
  const onHttp = (message: unknown) => {
    const request = (message as { request: http.ClientRequest }).request;
    // ClientRequest.host carries no port; the Host header does (127.0.0.1:1337).
    seen.push({ channel: 'http', origin: `${request.protocol}//${String(request.getHeader('host') ?? request.host)}`, path: request.path });
  };
  diagnostics_channel.subscribe('undici:request:create', onUndici);
  diagnostics_channel.subscribe('http.client.request.start', onHttp);
  return {
    seen,
    strapi: () => seen.filter((o) => STRAPI.test(`${o.origin}${o.path}`) && ![...issued].some((nonce) => o.path.includes(`${SELF_TEST}${nonce}`))),
    dispose: () => {
      diagnostics_channel.unsubscribe('undici:request:create', onUndici);
      diagnostics_channel.unsubscribe('http.client.request.start', onHttp);
    },
  };
}

/**
 * Fires one request down each channel and refuses to continue unless both were seen.
 * Detection only: this monitor records, it does not block. Blocking comes from the poison itself:
 * `.invalid` never resolves, so nothing reaches a poisoned host. The http probe goes to an owned
 * loopback server, never to 1337, so the self-test cannot reach a real Strapi.
 */
export async function selfTestOutboundMonitor(monitor: OutboundMonitor): Promise<void> {
  const nonce = randomUUID();
  issued.add(nonce);
  await fetch(`https://strapi.poison.invalid/graphql?${SELF_TEST}${nonce}`, { signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  const owned = http.createServer((_request, response) => response.end('ok'));
  await new Promise<void>((done) => owned.listen(0, '127.0.0.1', () => done()));
  const port = (owned.address() as { port: number }).port;
  try {
    await new Promise<void>((done) => {
      http.get(`http://127.0.0.1:${port}/strapi?${SELF_TEST}${nonce}`, { timeout: 5000 })
        .on('response', (response) => { response.resume(); done(); })
        .on('error', () => done()).on('timeout', () => done());
    });
  } finally {
    owned.close();
  }
  const hits = monitor.seen.filter((o) => o.path.includes(nonce));
  if (!hits.some((o) => o.channel === 'undici' && o.origin.includes('strapi.poison.invalid'))
      || !hits.some((o) => o.channel === 'http' && o.origin.endsWith(`:${port}`)))
    throw new Error('NO_STRAPI_OUTBOUND_MONITOR_BLIND');
}

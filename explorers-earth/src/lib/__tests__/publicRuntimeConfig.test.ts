import { describe, expect, it, vi } from 'vitest';
import { bootstrapPublicRuntime, parsePublicRuntimeConfig } from '../publicRuntimeConfig';
const origin = 'https://qa.example';
const valid = { version: 1, environment: 'qa', origin, apiPath: '/api', socketPath: '/socket.io', analytics: { enabled: false } };
describe('public runtime bootstrap boundary', () => {
  it('validates the wire and freezes public values', () => {
    const result = parsePublicRuntimeConfig(valid, origin);
    expect(result).toEqual(valid); expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([
    { ...valid, origin: 'https://production.example' },
    { ...valid, origin: 'https://user:pass@qa.example' },
    { ...valid, origin: origin + '/path' },
    { ...valid, apiPath: 'https://remote.example/api' },
    { ...valid, socketPath: '/ws' },
    { ...valid, GOOGLE_CLIENT_SECRET: 'SENTINEL' },
    { ...valid, mapsBrowserKeyRef: 'server-secret-reference' },
    { ...valid, analytics: { enabled: true, identifier: 'G-ABC' } },
    { ...valid, mapsBrowserKey: '<script>invalid</script>' },
  ])('rejects invalid or secret-bearing input', value => expect(() => parsePublicRuntimeConfig(value, origin)).toThrow());
  it('imports application only after no-store configuration response validates', async () => {
    const start = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => new Response(JSON.stringify(valid), { headers: { 'content-type': 'application/json' } }));
    await bootstrapPublicRuntime(fetcher as typeof fetch, origin, start);
    expect(fetcher).toHaveBeenCalledWith('/runtime-config.json', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
    expect(start).toHaveBeenCalledOnce();
  });
  it('cancels an oversized streamed response before reading the remaining chunks', async () => {
    const cancel=vi.fn(); let pulls=0;
    const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(4097));if(pulls>2)controller.close();},cancel});
    const start=vi.fn(async()=>undefined);
    await expect(bootstrapPublicRuntime((async()=>new Response(stream,{headers:{'content-type':'application/json'}})) as typeof fetch,origin,start)).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
  });
  it.each([new Response('html', { headers: { 'content-type': 'text/html' } }), new Response('{}', { status: 503 }), new Response(JSON.stringify({ ...valid, secret: 'SENTINEL' }), { headers: { 'content-type': 'application/json' } })])('never starts application on invalid config', async response => {
    const start = vi.fn(async () => undefined);
    await expect(bootstrapPublicRuntime((async () => response) as typeof fetch, origin, start)).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
  });
});

import { parsePublicRuntimeConfig, type PublicRuntimeConfig } from './publicRuntimeContract';
export { parsePublicRuntimeConfig };
let current: PublicRuntimeConfig | undefined;
export function isCanonicalRuntime(): boolean { return import.meta.env.MODE === 'platform'; }
export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  if (!current) throw new Error('PUBLIC_RUNTIME_CONFIG_UNAVAILABLE');
  return current;
}
export function runtimeOrigin(legacy: string): string { return isCanonicalRuntime() ? getPublicRuntimeConfig().origin : legacy; }
export function runtimeSocketTransport(legacy: {origin:string;path:string}): {origin:string;path:string} {
  const config = isCanonicalRuntime() ? getPublicRuntimeConfig() : undefined;
  return config ? {origin:config.origin,path:config.socketPath} : legacy;
}
export function mapsBrowserKey(): string { return isCanonicalRuntime() ? getPublicRuntimeConfig().mapsBrowserKey ?? '' : import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''; }
export async function bootstrapPublicRuntime(fetchImpl: typeof fetch, origin: string, start: () => Promise<unknown>): Promise<void> {
  current=undefined;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const response = await fetchImpl('/runtime-config.json', { cache:'no-store', credentials:'omit', redirect:'error', signal:abort.signal });
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('PUBLIC_RUNTIME_CONFIG_UNAVAILABLE');
    if (!response.body) throw new Error('PUBLIC_RUNTIME_CONFIG_INVALID');
    const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
    try {
      for (;;) {
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>4096){await reader.cancel();throw new Error('PUBLIC_RUNTIME_CONFIG_INVALID');}
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    current = parsePublicRuntimeConfig(JSON.parse(text), origin);
  } finally { clearTimeout(timer); }
  await start();
}

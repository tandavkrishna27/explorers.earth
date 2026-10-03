import {describe,it,expect,vi,afterEach} from 'vitest';
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
describe('canonical deployed consumer boundary',()=>{
  it('ignores baked legacy authority and provides bootstrap values before clients import',async()=>{
    vi.stubEnv('MODE','platform');vi.stubEnv('VITE_LOCAL_TUNES_API_URL','https://legacy.example');vi.stubEnv('VITE_PUBLIC_PROFILE_GATEWAY_URL','https://strapi.example');vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY','LEGACY_MAPS_SENTINEL');
    const runtime=await import('../publicRuntimeConfig');
    const wire={version:1,environment:'qa',origin:'https://qa.example',apiPath:'/api',socketPath:'/socket.io',mapsBrowserKey:'RESTRICTED_BROWSER_MAPS_KEY',analytics:{enabled:false}};
    await runtime.bootstrapPublicRuntime((async()=>new Response(JSON.stringify(wire),{headers:{'content-type':'application/json'}})) as typeof fetch,wire.origin,async()=>undefined);
    const request=vi.fn(async()=>new Response('{}',{headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',request);
    const profile=await import('../../features/PublicHome/api/publicProfileGatewayClient');
    await profile.publicProfileGatewayClient.shell('creator');
    expect(request).toHaveBeenCalledWith('https://qa.example/api/explorers/v1/profiles/creator',expect.anything());
    expect(runtime.mapsBrowserKey()).toBe('RESTRICTED_BROWSER_MAPS_KEY');
    expect(runtime.runtimeSocketTransport({origin:'https://legacy.example',path:'/ws'})).toEqual({origin:'https://qa.example',path:'/socket.io'});
    localStorage.setItem('explorers-cookie-consent',JSON.stringify({analytics:true}));
    const analytics=await import('../../utils/analytics');analytics.loadAnalytics();
    expect(document.getElementById('ga-script')).toBeNull();expect(document.getElementById('clarity-script')).toBeNull();
    localStorage.removeItem('explorers-cookie-consent');vi.unstubAllGlobals();
  });
});

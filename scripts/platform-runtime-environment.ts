// Pure allowlist for the separate API-only environment input.
export function validateApiEnvironment(value: unknown):void {
 const allowed=['EXPLORERS_AUTH_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','EXPLORERS_MEDIA_S3_BUCKET','EXPLORERS_MEDIA_S3_REGION','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN'];
 const required=allowed.filter(k=>k!=='AWS_SESSION_TOKEN');
 const invalid=()=>{throw new Error('API_ENVIRONMENT_INVALID');};
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const r=value as Record<string,unknown>;
 if(Object.keys(r).some(k=>!allowed.includes(k))||required.some(k=>typeof r[k]!=='string'||!(r[k] as string).length))return invalid();
 if(Object.values(r).some(v=>typeof v!=='string'||v.length>4096||/[\r\n\0]/.test(v)))return invalid();
 if((r.EXPLORERS_AUTH_SECRET as string).length<32||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(r.EXPLORERS_MEDIA_S3_BUCKET as string)||!/^[a-z]{2}-[a-z]+-[1-9]$/.test(r.EXPLORERS_MEDIA_S3_REGION as string))return invalid();
}

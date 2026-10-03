import { createHash } from 'node:crypto';
const fail = message => { throw new Error(message); };
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) fail('Noncanonical value');
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function exactFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...fields].sort().join(',')) fail(`${label}: invalid fields`);
}
export function identityKey(identity) {
  exactFields(identity,['file','titlePath','project','repeat'],'identity');
  if (typeof identity.file !== 'string' || !identity.file || /[\\:\x00-\x1f]/.test(identity.file) || identity.file.startsWith('/') || identity.file.split('/').some(p=>!p || p==='.' || p==='..')) fail('Identity file must be normalized repository relative');
  if (!Array.isArray(identity.titlePath) || !identity.titlePath.length || identity.titlePath.some(t=>typeof t!=='string'||!t)) fail('Identity titlePath required');
  if (typeof identity.project!=='string'||!Number.isSafeInteger(identity.repeat)||identity.repeat<0) fail('Invalid project/repeat');
  return canonical(identity);
}
export function checkedIdentities(identities) {
  if (!Array.isArray(identities)||!identities.length) fail('Empty identity inventory');
  const keys=identities.map(identityKey); if(new Set(keys).size!==keys.length) fail('Duplicate identity');
  return [...identities].sort((a,b)=>identityKey(a)<identityKey(b)?-1:identityKey(a)>identityKey(b)?1:0);
}
export function checkedProvenance(p) {
  const fields=['sha','sourceHash','configHash','lockHash'];
  if(Object.hasOwn(p??{},'schemaVersion')) { if(p.schemaVersion!==2) fail('Unknown provenance schema'); fields.push('schemaVersion'); }
  exactFields(p,fields,'provenance');
  if(!/^[a-f0-9]{40}$/.test(p.sha)||['sourceHash','configHash','lockHash'].some(k=>!/^[a-f0-9]{64}$/.test(p[k]))) fail('Invalid source provenance');
}
/** --list reports no execution results: its status=skipped is not a runtime pass. */
export function discoveryIdentities(child,{filePrefix,projects}) {
  if(child.status!==0||child.signal||child.error) fail(`Discovery child failed: ${child.stderr??''} ${child.stdout??''}`);
  let report;try{report=JSON.parse(child.stdout);}catch{fail('Malformed discovery JSON');}
  if(!Array.isArray(report.errors)||report.errors.length||!Array.isArray(report.suites)||!report.suites.length) fail(`Incomplete discovery or loader errors: ${JSON.stringify(report.errors)}`);
  if(!projects||!Object.keys(projects).length||Object.values(projects).some(v=>!Number.isSafeInteger(v)||v<1)) fail('Invalid project/repeat inventory');
  identityKey({file:`${filePrefix}/probe.spec.ts`,titlePath:['probe'],project:'probe',repeat:0});
  const found=[];
  function walk(suite,titles,root) {
    if(!suite||typeof suite.title!=='string') fail('Malformed suite');
    const next=root?titles:[...titles,suite.title];
    if(suite.specs!==undefined&&!Array.isArray(suite.specs)) fail('Malformed specs');
    for(const spec of suite.specs??[]) {
      if(typeof spec.file!=='string'||!spec.file||typeof spec.title!=='string'||!Array.isArray(spec.tests)||!spec.tests.length) fail('Malformed spec');
      for(const t of spec.tests) {
        if(!Object.hasOwn(projects,t.projectName)) fail('Unknown project');
        if(t.expectedStatus!=='passed'||!Array.isArray(t.annotations)||t.annotations.some(a=>['skip','fixme','fail'].includes(a.type))||!Array.isArray(t.results)||t.results.length) fail('Unsupported discovery status/annotations/results');
        for(let repeat=0;repeat<projects[t.projectName];repeat++) found.push({file:`${filePrefix}/${spec.file}`,titlePath:[...next,spec.title],project:t.projectName,repeat});
      }
    }
    if(suite.suites!==undefined&&!Array.isArray(suite.suites)) fail('Malformed nested suites');
    for(const nested of suite.suites??[]) walk(nested,next,false);
  }
  for(const suite of report.suites) walk(suite,[],true);
  return checkedIdentities(found);
}
/** Pure deterministic longest-processing-time packing; absent timings cost 1ms. */
export function planShards({identities,provenance,shardCount,timings=[],atomicGroups=[]}) {
  const inventory=checkedIdentities(identities);checkedProvenance(provenance);
  if(!Number.isSafeInteger(shardCount)||shardCount<1||shardCount>inventory.length||!Array.isArray(timings)||!Array.isArray(atomicGroups)) fail('Invalid shard inputs');
  const known=new Map(inventory.map(i=>[identityKey(i),i]));const durations=new Map();
  for(const t of timings) { exactFields(t,['identity','durationMs'],'timing');const key=identityKey(t.identity);if(!known.has(key)||durations.has(key)||!Number.isFinite(t.durationMs)||t.durationMs<0) fail('Invalid timing');durations.set(key,t.durationMs); }
  const grouped=new Set(),units=[];
  for(const group of atomicGroups) {const ids=checkedIdentities(group);for(const i of ids){const key=identityKey(i);if(!known.has(key)||grouped.has(key))fail('Unknown/overlapping atomic group');grouped.add(key);}units.push(ids);}
  for(const i of inventory)if(!grouped.has(identityKey(i)))units.push([i]);
  if(units.length<shardCount)fail('Atomic groups would leave empty shards');
  const weighted=units.map(ids=>({identities:ids,weight:ids.reduce((s,i)=>s+(durations.get(identityKey(i))??1),0),key:canonical(ids)})).sort((a,b)=>b.weight-a.weight||(a.key<b.key?-1:a.key>b.key?1:0));
  const shards=Array.from({length:shardCount},(_,index)=>({index:index+1,identities:[],estimatedDurationMs:0}));
  for(const u of weighted){const shard=[...shards].sort((a,b)=>a.estimatedDurationMs-b.estimatedDurationMs||a.identities.length-b.identities.length||a.index-b.index)[0];shard.identities.push(...u.identities);shard.estimatedDurationMs+=u.weight;}
  for(const s of shards){s.identities=checkedIdentities(s.identities);s.assignmentHash=digest({index:s.index,identities:s.identities});}
  const plan={schemaVersion:provenance.schemaVersion??1,provenance:structuredClone(provenance),inventoryHash:digest(inventory),identities:inventory,shards};
  plan.planHash=digest(plan);return plan;
}
export function validatePlan(plan) {
  exactFields(plan,['schemaVersion','provenance','inventoryHash','identities','shards','planHash'],'plan');
  if(![1,2].includes(plan.schemaVersion)||plan.schemaVersion!==(plan.provenance?.schemaVersion??1))fail('Unknown/inconsistent plan schema');checkedProvenance(plan.provenance);const ids=checkedIdentities(plan.identities);
  const {planHash,...body}=plan;if(planHash!==digest(body)||plan.inventoryHash!==digest(ids)||!Array.isArray(plan.shards)||!plan.shards.length)fail('Plan digest mismatch');
  const all=[];for(const [n,s] of plan.shards.entries()){exactFields(s,['index','identities','estimatedDurationMs','assignmentHash'],'assignment');if(s.index!==n+1||!Number.isFinite(s.estimatedDurationMs)||s.estimatedDurationMs<0)fail('Invalid assignment');checkedIdentities(s.identities);if(s.assignmentHash!==digest({index:s.index,identities:s.identities}))fail('Assignment digest mismatch');all.push(...s.identities);}
  if(canonical(checkedIdentities(all))!==canonical(ids))fail('Assignment union mismatch');return true;
}

import {createHash} from 'node:crypto';
export const PUBLIC_PARITY_TITLES=Object.freeze([
 'Public parity: eight canonical category and nested cold entries render owned positive content',
 'Public parity: category list item catalog and guide continuations preserve every ordered seeded ID',
 'Public parity: same slugs resolve independently for two owners and canonical handles',
 'Public parity: profile category list and item visibility refuse hidden anonymous and foreign reads',
 'Public parity: missing private draft and archived details share the public unavailable response',
 'Public parity: account and category withdrawal deny previously issued continuation cursors',
 'Public parity: unpublish revalidation never returns cached private content as 304',
 'Public parity: logout and account replacement cannot reuse another account public cache',
 'Public parity: cross tab unpublish remains hidden during failed and stale refresh',
 'Public parity: duplicate and wrong account invalidations preserve the correct profile',
 'Public parity: rapid username changes and history never reveal a late previous profile',
 'Public parity: invalid handles and terminal API failures release the cold entry overlay',
 'Public parity: uploaded images videos and ranges obey every media ancestor boundary',
 'Public parity: pinned navigation top picks themes and fallback attribution remain compatible',
 'Public parity: genre subject sector and linked child routes render eligible nested content',
 'Public parity: keyboard focus and long names preserve the baseline public shells',
]);
export const PEOPLE_TITLES=Object.freeze([
 'People: native manual list and typed person create edit and reload preserve nullable facts and notes',
 'People: same-name records and matching account handles remain distinct without identity authority',
 'People: shared-person presentation and immutable handle preserve owner isolation and stale drafts',
 'People: native draft publication and public detail retain explicit social fields without private owner data',
 'People: pre-suppressed public omission preserves the original owner record and eligible control',
 'People: configured-empty sector input preserves ordinary recommendations and refuses unknown public sectors',
]);
export const APPS_ENRICHMENT_TITLES=Object.freeze(['Apps enrichment: explicit approved source choices and selected-field acceptance survive reload','Apps enrichment: disable same-source re-enable and different-source rebind preserve manual values']);
// Ten original lanes: the eleven-lane inventory (db513b66...) with the retired Music lane removed.
const baseline='cb448e4150cc81419cea920a08927aa3403ff643ddefa73d062e980643409ef1';
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
/** Authored registration only; execution receipts must independently prove every identity. */
export function buildWave2BrowserRegistration(original){
 const lanes=original?.lanes;
 if(!Array.isArray(lanes)||lanes.length!==10)throw Error('Original Wave2 browser inventory changed');
 const source=JSON.stringify(lanes.map(l=>({name:l.name,runner:l.runner,config:l.config,spec:l.spec,projects:l.projects,identities:l.identities})));
 if(createHash('sha256').update(source).digest('hex')!==baseline)throw Error('Original Wave2 browser inventory changed');
 const preserved=JSON.parse(JSON.stringify(lanes));
 for(const[name,titles]of [['public-parity',PUBLIC_PARITY_TITLES],['people',PEOPLE_TITLES],['apps-enrichment',APPS_ENRICHMENT_TITLES]]){
  const spec=`explorers-earth/e2e/replatform/${name}.spec.ts`,projects=name==='apps-enrichment'?['apps-desktop','apps-mobile']:[`${name}-desktop`,`${name}-mobile`];
  preserved.push({name,runner:'tunes/scripts/profile-browser-fixture.ts',config:`explorers-earth/e2e/replatform/${name}.playwright.config.ts`,spec,projects,identities:projects.flatMap(project=>titles.map(title=>({file:spec,titlePath:[title],project,repeat:0})))});
 }
 return freeze({version:1,status:'authored',qualified:false,originalIdentityCount:142,originalIdentityDigest:baseline,addedIdentityCount:48,totalIdentityCount:190,lanes:preserved});
}

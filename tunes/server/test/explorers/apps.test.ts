import {it,expect} from 'vitest';import {readFileSync} from 'node:fs';
import {appEntityDetailsSchema,appDisplayFieldsSchema,appScreenshotsSchema,resolveManualAppSchema,safeAppUrlSchema} from '../../../shared/explorersAppContract';

const details=(over:Record<string,unknown>={})=>({appUrl:'https://example.com/app',developer:'Dev',logoUrl:null,description:null,downloadUrl:null,priceTier:'Freemium',platforms:['iOS','macOS'],...over});

it('Apps0043 declares typed details, slotted owned screenshots and their guards',()=>{
 const sql=readFileSync(new URL('../../../migrations/0043_explorers_apps_provider_context.sql',import.meta.url),'utf8');
 for(const name of ['app_entity_details','recommendation_app_screenshots'])expect(sql).toContain(`CREATE TABLE public.${name}`);
 // Screenshots are owned media, not a URL array: the relation is keyed to media_assets
 // with the account, exactly as book covers and movie media are.
 expect(sql).toMatch(/REFERENCES public\.media_assets\(id,account_id\) ON DELETE RESTRICT/);
 expect(sql).toMatch(/REFERENCES public\.recommendations\(id,account_id,category\) ON DELETE CASCADE/);
 expect(sql).toContain('guard_app_entity_details');expect(sql).toContain('guard_recommendation_app_screenshot');
 // The database refuses an unsafe scheme independently of the contract below.
 expect(sql).toMatch(/app_url ~ '\^https\?:\/\/'/);
 expect(sql).toContain("price_tier IN ('Free','Freemium','Paid','Subscription')");
 // Account deletion must reach screenshots, and every category revision trigger must
 // know the table, or an owner's page would serve a stale snapshot after an edit.
 expect(sql).toMatch(/DELETE FROM public\.recommendation_app_screenshots WHERE account_id=target_account/);
 for(const kind of ['insert','update','delete'])expect(sql).toContain(`recommendation_app_screenshots_content_revision_${kind}`);
 // Deliberately absent: taxonomy belongs to its own ticket, not to 4.3. The name does
 // appear, because the revision functions carry forward 0038's table allowlist verbatim,
 // so the claim is that 0043 introduces no taxonomy table and writes no taxonomy row.
 expect(sql).not.toMatch(/CREATE TABLE public\.\w*taxonomy/);
 expect(sql).not.toMatch(/INSERT INTO public\.(?:taxonomy_terms|recommendation_taxonomy)/);
});

it('rejects every unsafe outbound scheme and authority trick on an App URL',()=>{
 // Ticket 4.3's unsafe_outbound_scheme_is_rejected. A stored javascript: or data: URL is
 // rendered as a link on a public profile, so this is the whole obligation.
 for(const bad of ['javascript:alert(1)','data:text/html,<script>','file:///etc/passwd','vbscript:x','http://user:pass@example.com/a','https://example.com:8443/a','not-a-url',''])
  expect(safeAppUrlSchema.safeParse(bad).success,bad).toBe(false);
 for(const good of ['https://example.com/app','http://example.com/a?b=c#d'])expect(safeAppUrlSchema.safeParse(good).success,good).toBe(true);
 expect(appEntityDetailsSchema.safeParse(details({appUrl:'javascript:alert(1)'})).success).toBe(false);
 expect(appEntityDetailsSchema.safeParse(details({logoUrl:'data:image/png;base64,AAA'})).success).toBe(false);
 expect(appEntityDetailsSchema.safeParse(details({downloadUrl:'file:///tmp/x'})).success).toBe(false);
});

it('round-trips every typed App field and refuses an unknown one',()=>{
 const parsed=appEntityDetailsSchema.parse(details({description:'Notes',downloadUrl:'https://example.com/get',logoUrl:'https://example.com/logo.png'}));
 expect(parsed).toEqual({appUrl:'https://example.com/app',developer:'Dev',logoUrl:'https://example.com/logo.png',description:'Notes',downloadUrl:'https://example.com/get',priceTier:'Freemium',platforms:['iOS','macOS']});
 expect(appEntityDetailsSchema.safeParse({...details(),screenshots:['https://example.com/1.png']}).success).toBe(false);
});

it('accepts exactly the four price tiers and null, and nothing else',()=>{
 for(const tier of ['Free','Freemium','Paid','Subscription',null])expect(appEntityDetailsSchema.safeParse(details({priceTier:tier})).success,String(tier)).toBe(true);
 for(const tier of ['Gratis','free','PAID',0,''])expect(appEntityDetailsSchema.safeParse(details({priceTier:tier})).success,String(tier)).toBe(false);
});

it('bounds platforms without inventing a closed vocabulary',()=>{
 expect(appEntityDetailsSchema.safeParse(details({platforms:[]})).success).toBe(true);
 expect(appEntityDetailsSchema.safeParse(details({platforms:['visionOS']})).success).toBe(true);
 expect(appEntityDetailsSchema.safeParse(details({platforms:Array.from({length:16},(_,i)=>'p'+i)})).success).toBe(true);
 expect(appEntityDetailsSchema.safeParse(details({platforms:Array.from({length:17},(_,i)=>'p'+i)})).success).toBe(false);
 expect(appEntityDetailsSchema.safeParse(details({platforms:['']})).success).toBe(false);
});

it('requires both a title and an App URL to resolve a manual App',()=>{
 // 0043 declares app_url NOT NULL, so a details row cannot exist without one. A manual
 // resolve that omitted it would be accepted here and then fail in the database.
 expect(resolveManualAppSchema.safeParse({kind:'manual',category:'apps',details:{title:'Tool',appUrl:'https://example.com/app'}}).success).toBe(true);
 expect(resolveManualAppSchema.safeParse({kind:'manual',category:'apps',details:{title:'Tool'}}).success).toBe(false);
 expect(resolveManualAppSchema.safeParse({kind:'manual',category:'apps',details:{appUrl:'https://example.com/app'}}).success).toBe(false);
 expect(resolveManualAppSchema.safeParse({kind:'manual',category:'books',details:{title:'Tool',appUrl:'https://example.com/app'}}).success).toBe(false);
});

it('patches display fields partially and keeps screenshots to ten owned media IDs',()=>{
 expect(appDisplayFieldsSchema.safeParse({}).success).toBe(true);
 expect(appDisplayFieldsSchema.safeParse({developer:'Only this'}).success).toBe(true);
 expect(appDisplayFieldsSchema.safeParse({developer:'x',unknown:1}).success).toBe(false);
 // appUrl is the app's identity, not presentation. A display override re-presents a
 // shared entity for one owner, so permitting it would let that owner point everyone
 // else's entity at a different URL.
 expect(appDisplayFieldsSchema.safeParse({appUrl:'https://evil.example/app'}).success).toBe(false);
 const id=()=>'00000000-0000-4000-8000-0000000000'+String(10+Math.floor(Math.random()*89));
 expect(appScreenshotsSchema.safeParse({screenshotMediaIds:[]}).success).toBe(true);
 expect(appScreenshotsSchema.safeParse({screenshotMediaIds:Array.from({length:10},id)}).success).toBe(true);
 expect(appScreenshotsSchema.safeParse({screenshotMediaIds:Array.from({length:11},id)}).success).toBe(false);
 // URLs are never accepted where owned media is required.
 expect(appScreenshotsSchema.safeParse({screenshotMediaIds:['https://example.com/1.png']}).success).toBe(false);
});

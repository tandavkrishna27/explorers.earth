import type { Pool, PoolClient } from 'pg';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { isProxy } from 'node:util/types';
import { readFile } from 'node:fs/promises';
import type { PlacePinsBoundary } from '../server/application/placePinsBoundary';
import { placePinsResultSchema } from '../shared/explorersPlacePinsContract';
import type {RequestContext} from '../shared/explorersContract';
import type { Actor } from '../server/application/actor';
import type { ExplorersAuthConfig, createExplorersAuth } from '../server/auth/betterAuth';
import type { ObjectStorage } from '../server/services/objectStorage';
import { ensureInitialAccount } from '../server/auth/initialAccount';
import { RecommendationService } from '../server/application/recommendations';
import { ProfileService } from '../server/application/profiles';
import { OwnerContentService } from '../server/application/ownerContent';
import { MediaService } from '../server/application/media';
import { createGuideSection, writeGuideDetails, readGuideDetails, updateGuideSection, attachGuideCover } from '../server/repositories/guideRepository';
import { insertBookDetails, readBookEntity } from '../server/repositories/bookCatalogRepository';
import { insertMovieDetails, readMovieEntity } from '../server/repositories/movieCatalogRepository';
import { insertAppDetails, readAppEntity } from '../server/repositories/appCatalogRepository';
import { insertProductDetails, readProductEntity } from '../server/repositories/productCatalogRepository';
import { insertPersonDetails, readPersonEntity } from '../server/repositories/personCatalogRepository';
import { insertPlaceDetails, readPlaceEntity, readPlaceCollectionDetails } from '../server/repositories/placeCatalogRepository';
import { readManualGamePresentation } from '../server/repositories/gameManualRepository';
import { loadReviewedTaxonomyInputs, reviewedTaxonomyInputDirectory } from './taxonomy-owned-import';
import { applyTaxonomyCatalogImport } from '../server/services/taxonomyCatalogImport';
import { bookEntityDetailsSchema } from '../shared/explorersBookContract';
import { movieDetailsSchema } from '../shared/explorersMovieContract';
import { appEntityDetailsSchema } from '../shared/explorersAppContract';
import { productEntityDetailsSchema } from '../shared/explorersProductContract';
import { personEntityDetailsSchema } from '../shared/explorersPersonContract';
import { placeEntityDetailsSchema } from '../shared/explorersPlaceContract';
import { guideCollectionDetailsSchema, guideSectionBlocksSchema } from '../shared/explorersGuideContract';
import { manualGamePresentationSchema } from '../shared/explorersGameOwnerContract';
import { buildPublicParitySeedPlan, buildPeopleSeedPlan, publicParityExpectedManifestSchema, publicParityIssuedManifestSchema, publicParityObservationSchema, type PublicParityExpectedManifest, type PublicParityIssuedManifest, type PublicParityObservation, type PublicParityMaterializedReset, type PublicParityPrivateObservation } from './public-parity-browser-support';
type Owner = 'ownerA' | 'ownerB';
type Category = PublicParityIssuedManifest['categories'][number]['category'];
type Persona = Readonly<{
    actor: Actor;
    handle: string;
}>;
export type PublicParityCompositionAdmission = Readonly<{
    admission: unknown;
    pool: Pool;
    signal: AbortSignal;
    personas: Readonly<Record<Owner, Persona>>;
    placePins: Pick<PlacePinsBoundary, 'execute'>;
    auth: ReturnType<typeof createExplorersAuth>;
    authConfig: ExplorersAuthConfig;
    storage: ObjectStorage;
    operation: 'public-people-fixture';
}>;
export type PublicParityOwnedCompositionOptions = Omit<PublicParityCompositionAdmission, 'operation'> & Readonly<{
    verifyAdmission: (binding: PublicParityCompositionAdmission) => void;
}>;
type EntitySeed = {
    key: string;
    title: string;
    details: unknown;
    suppressed: boolean;
    category: Category;
};
type ListSeed = {
    key: string;
    owner: Owner;
    category: Category;
    title: string;
    slug: string;
    displayOrder: number;
    control: 'private' | 'draft' | 'archived' | null;
    visibility: 'public' | 'private';
    publicationState: 'draft' | 'published';
    archived: boolean;
    details: unknown;
};
type ItemSeed = {
    key: string;
    owner: Owner;
    collectionKey: string;
    entityKey: string | null;
    title: string;
    displayOrder: number;
    control: 'withheld' | null;
    publicationState?: 'draft' | 'published';
    archived: boolean;
    details: unknown;
};
type AllocatedList = {
    id: string;
    seed: ListSeed;
};
type AllocatedEntity = {
    id: string;
    seed: EntitySeed;
};
type AllocatedItem = {
    id: string;
    seed: ItemSeed;
    category: Category;
    collectionId: string;
    entityId: string | null;
};
const refuse = () => new Error('Public fixture composition refused');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP8z4AdMDEMKQkAzUEBD7t4NqoAAAAASUVORK5CYII=', 'base64');
const videoUrl = new URL('../../fixtures/replatform/public-parity/one-frame.mp4', import.meta.url), videoHash = '0449e50acf8d3f1b6315934b36bcd0526731f981bf90e054bb5ebff46c50976a';
const taxonomyManifestHash = '0087cf143b6f8ae68f60087539083bd0f7992c50c846b4c98a02dc1e9155ccff';
function capture(input: PublicParityOwnedCompositionOptions) { if (!input || typeof input !== 'object' || isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype)
    throw refuse(); const d = Object.getOwnPropertyDescriptors(input), keys = ['admission', 'pool', 'signal', 'personas', 'placePins', 'auth', 'authConfig', 'storage', 'verifyAdmission']; if (Reflect.ownKeys(d).length !== keys.length || keys.some(key => !d[key]?.enumerable || !Object.hasOwn(d[key], 'value')))
    throw refuse(); const result = Object.fromEntries(keys.map(key => [key, d[key].value])) as PublicParityOwnedCompositionOptions; if (!result.placePins || typeof result.placePins !== 'object' || !(result.signal instanceof AbortSignal) || typeof result.verifyAdmission !== 'function')
    throw refuse(); return Object.freeze(result); }
/** Internal native witness callbacks; construction is inert and mint failure stays terminal. */
export function createPublicParitySessionRotation(readAbsent:()=>Promise<boolean>,verifyMembership:()=>Promise<void>,mint:()=>Promise<Readonly<{cookie:string}>>){let attempt:Promise<Readonly<{cookie:string}>|undefined>|undefined,delivered=false;return async()=>{if(delivered)return undefined;if(!attempt)attempt=(async()=>{if(!await readAbsent())return undefined;await verifyMembership();return mint();})();const current=attempt,result=await current;if(!result){if(attempt===current)attempt=undefined;return undefined;}if(delivered)return undefined;delivered=true;return result;};}
/** Root handles only. Construction/import allocates no connection, session, file or object. */
export async function retirePublicParityMedia(service:Pick<MediaService,'deleteMedia'>,actor:Actor,id:string,context:RequestContext,readProof:()=>Promise<{assetDeleted:boolean;objects:readonly {deleted:boolean;storageDeleted:boolean}[]}>):Promise<void>{await service.deleteMedia(actor,id,context);const proof=await readProof();if(proof.assetDeleted!==true||!proof.objects.length||proof.objects.some(object=>object.deleted!==true||object.storageDeleted!==true))throw refuse();}
export function createPublicParityOwnedComposition(input: PublicParityOwnedCompositionOptions) {
    const options = capture(input), binding: PublicParityCompositionAdmission = Object.freeze({ admission: options.admission, pool: options.pool, signal: options.signal, personas: options.personas, placePins: options.placePins, auth: options.auth, authConfig: options.authConfig, storage: options.storage, operation: 'public-people-fixture' });
    const pending = new Set<Promise<unknown>>(), clients = new Set<PoolClient>(), lists = new Map<string, AllocatedList>(), entities = new Map<string, AllocatedEntity>(), items = new Map<string, AllocatedItem>(), mediaIds = new Set<string>(), sessionTokens = new Set<string>();
    const ownerSessionTokens=new Map<Owner,string>(); let rotateOwnerA:(()=>Promise<Readonly<{cookie:string}>|undefined>)|undefined;
    const deletions=new Map<string,'fulfilled'|'rejected'>();
    const baselineReceipts = new Set<string>(), lineage = new Map<string, {
        operation: string;
        receiptId: string;
        accountId: string;
    }>();
    let databaseValidated = false;
    let phase: 'idle' | 'resetting' | 'issued' | 'observing' | 'retiring' | 'failed' = 'idle', expected: PublicParityExpectedManifest | undefined, issued: PublicParityIssuedManifest | undefined;
    function guard() { options.verifyAdmission(binding); if (options.signal.aborted)
        throw refuse(); }
    async function retain<T>(work: Promise<T>): Promise<T> { pending.add(work); try {
        return await work;
    }
    finally {
        pending.delete(work);
    } }
    const pool = { async query(...args: unknown[]) { guard(); const result = await retain((options.pool.query as (...args: unknown[]) => Promise<any>).apply(options.pool, args)); guard(); return result; }, async connect() { guard(); const original = await retain(options.pool.connect()); clients.add(original); try {
            guard();
        }
        catch (error) {
            original.release(true);
            clients.delete(original);
            throw error;
        } let released = false; return { async query(...args: unknown[]) { guard(); const result = await retain((original.query as (...args: unknown[]) => Promise<any>).apply(original, args)); guard(); return result; }, release(destroy?: boolean) { if (released)
                throw refuse(); released = true; let revoked = false; try {
                options.verifyAdmission(binding);
            }
            catch {
                revoked = true;
            } original.release(destroy || revoked || options.signal.aborted); clients.delete(original); } } as PoolClient; } } as unknown as Pool;
    const storage: ObjectStorage = { environment: 'local', put: async (key, bytes) => { guard(); const result = await retain(options.storage.put(key, bytes)); guard(); return result; }, get: async (key) => { guard(); const result = await retain(options.storage.get(key)); guard(); return result; }, delete: async (key, version) => { guard(); try{await retain(options.storage.delete(key, version)); guard();deletions.set(key,'fulfilled');}catch(error){deletions.set(key,'rejected');throw error;} }, putOwned: (key, bytes, deadlineMs) => { guard(); if (!options.storage.putOwned)
            throw refuse(); const operation = options.storage.putOwned(key, bytes, deadlineMs); return { completion: retain(operation.completion), settlement: retain(operation.settlement), nativeResult: retain(operation.nativeResult) }; } };
    async function transaction<T>(work: (db: PoolClient) => Promise<T>) { const db = await pool.connect(); try {
        await db.query('BEGIN');
        const value = await work(db);
        await db.query('COMMIT');
        return value;
    }
    catch (error) {
        try {
            await db.query('ROLLBACK');
        }
        catch { /* Known original lease is destroyed after revoked admission. */ }
        throw error;
    }
    finally {
        db.release();
    } }
    const context = () => ({ requestId: randomUUID(), idempotencyKey: randomUUID() }), actor = (owner: Owner) => options.personas[owner].actor;
    const recommendations = new RecommendationService(pool), profiles = new ProfileService(pool);
    const row = async (sql: string, args: unknown[]) => { const result = await pool.query(sql, args); if (result.rows.length !== 1)
        throw refuse(); return result.rows[0] as Record<string, any>; };
    const categoryRevision = async (owner: Owner, category: Category) => String((await row("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=$2),'0') revision", [actor(owner).accountId, category])).revision);
    const listRevision = async (id: string, owner: Owner) => Number((await row('SELECT revision FROM collections WHERE id=$1 AND account_id=$2', [id, actor(owner).accountId])).revision);
    async function assertDatabase(identity: PublicParityExpectedManifest) { const actual = await pool.query('SELECT current_database() name,current_user role'); if (actual.rows.length !== 1 || actual.rows[0].name !== 'music_uat_' + identity.runId || actual.rows[0].role !== 'music_migrator')
        throw refuse(); databaseValidated = true; }
    async function prepare(identity: PublicParityExpectedManifest) {
        for (const owner of ['ownerA', 'ownerB'] as const) {
            const source = options.personas[owner], wanted = identity.personas[owner];
            if (source.actor.credential.kind !== 'oauth' || source.actor.accountId !== wanted.accountId || source.actor.userId !== wanted.userId || source.handle !== wanted.handle)
                throw refuse();
        }
        await assertDatabase(identity);
        for (const owner of ['ownerA', 'ownerB'] as const) {
            const source = options.personas[owner], wanted = identity.personas[owner];
            if (source.actor.credential.kind !== 'oauth' || source.actor.accountId !== wanted.accountId || source.actor.userId !== wanted.userId || source.handle !== wanted.handle)
                throw refuse();
            const initial = await row('SELECT account_id FROM initial_account_bindings WHERE user_id=$1', [source.actor.userId]);
            if (initial.account_id !== source.actor.accountId)
                throw refuse();
            const account = await ensureInitialAccount(pool, source.actor.userId);
            if (account.accountId !== source.actor.accountId)
                throw refuse();
            const native = await row('SELECT a.id,a.handle,a.status,a.onboarding_status,m.role FROM creator_accounts a JOIN account_memberships m ON m.account_id=a.id WHERE a.id=$1 AND m.user_id=$2', [source.actor.accountId, source.actor.userId]);
            if (native.role !== 'owner' || native.status !== 'active' || native.onboarding_status !== 'complete')
                throw refuse();
            const profile = await profiles.getMyProfile(source.actor);
            await profiles.updateAccount(source.actor, { expectedRevision: profile.revision, handle: source.handle, displayName: profile.displayName, publicProfile: true, categories: profile.categories.map(category => ({ ...category, isPublic: category.category === 'music' ? category.isPublic : true })) }, context());
        }
        guard();
        const taxonomy = loadReviewedTaxonomyInputs({ fixedDirectory: reviewedTaxonomyInputDirectory, expectedManifestHash: taxonomyManifestHash });
        guard();
        await applyTaxonomyCatalogImport(pool, taxonomy.people, 'root-public-people-fixture');
        if (identity.family === 'public-parity')
            await applyTaxonomyCatalogImport(pool, taxonomy.places, 'root-public-people-fixture');
    }
    async function makeEntity(seed: EntitySeed) { const id = await transaction(async (db) => { const kind = seed.category === 'people' ? 'person' : seed.category === 'places' ? 'place' : seed.category.slice(0, -1), created = (await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES($1,$2,'manual',to_tsvector('simple',$2)) RETURNING id", [kind, seed.title])).rows[0]; if (!created?.id)
        throw refuse(); switch (seed.category) {
        case 'books':
            await insertBookDetails(db, created.id, bookEntityDetailsSchema.parse(seed.details));
            break;
        case 'movies':
            await insertMovieDetails(db, created.id, movieDetailsSchema.parse(seed.details));
            break;
        case 'apps':
            await insertAppDetails(db, created.id, appEntityDetailsSchema.parse(seed.details));
            break;
        case 'products':
            await insertProductDetails(db, created.id, productEntityDetailsSchema.parse(seed.details));
            break;
        case 'people':
            await insertPersonDetails(db, created.id, personEntityDetailsSchema.parse(seed.details));
            if (seed.suppressed)
                await db.query('UPDATE person_entity_details SET suppressed_at=clock_timestamp() WHERE entity_id=$1', [created.id]);
            break;
        case 'places':
            await insertPlaceDetails(db, created.id, placeEntityDetailsSchema.parse(seed.details));
            break;
        case 'games':
            manualGamePresentationSchema.parse(seed.details);
            break;
        default: throw refuse();
    } return String(created.id); }); entities.set(seed.key, { id, seed }); }
    async function makeList(seed: ListSeed) {
        const created = await recommendations.createCollection(actor(seed.owner), { category: seed.category, title: seed.title, slug: seed.slug, visibility: seed.visibility, publicationState: seed.publicationState, ...(seed.category === 'places' ? { placeLocation: seed.details } : {}) }, context());
        lists.set(seed.key, { id: created.id, seed });
        if (seed.category === 'guides') {
            const revision = Number(await categoryRevision(seed.owner, 'guides'));
            await transaction(db => writeGuideDetails(db, created.id, actor(seed.owner).accountId, revision, guideCollectionDetailsSchema.parse(seed.details)));
        }
    }
    let revisions = new Map<string, string>();
    const categoryRevisionValue = (owner: Owner, category: Category) => { const value = revisions.get(owner + category); if (value === undefined)
        throw refuse(); return value; };
    async function makeItem(seed: ItemSeed, category: Category) { const parent = lists.get(seed.collectionKey); if (!parent)
        throw refuse(); const accountId = actor(seed.owner).accountId; let id: string, entityId: string | null = null; if (category === 'guides') {
        id = await transaction(db => createGuideSection(db, parent.id, accountId, Number(categoryRevisionValue(seed.owner, 'guides')), { title: seed.title, description: null, blocks: guideSectionBlocksSchema.parse(seed.details), position: seed.displayOrder }));
        if (seed.archived)
            await transaction(async (db) => { await db.query('UPDATE guide_sections SET archived_at=clock_timestamp() WHERE id=$1 AND account_id=$2', [id, accountId]); });
    }
    else {
        entityId = entities.get(seed.entityKey!)?.id ?? null;
        if (!entityId)
            throw refuse();
        const taxonomy = category === 'places' ? (await pool.query("SELECT c.id child,p.id parent FROM taxonomy_terms c JOIN taxonomy_terms p ON p.id=c.parent_id WHERE c.category='places' AND c.active AND p.active ORDER BY c.position,c.id LIMIT 1")).rows[0] : null;
        if (category === 'places' && !taxonomy)
            throw refuse();
        const created = await recommendations.createRecommendation(actor(seed.owner), { category, entityId, collectionId: parent.id, expectedCollectionRevision: await listRevision(parent.id, seed.owner), publicationState: seed.publicationState, userRating: null, note: null, ...(category === 'people' ? { peopleSectorTermId: null } : {}), ...(taxonomy ? { placesTaxonomy: { categoryTermId: taxonomy.parent, subcategoryTermId: taxonomy.child } } : {}) }, context());
        id = created.id;
    } items.set(seed.key, { id, seed, category, collectionId: parent.id, entityId }); revisions.set(seed.owner + category, await categoryRevision(seed.owner, category)); }
    async function materialize(identity: PublicParityExpectedManifest) {
        const plan = identity.family === 'public-parity' ? buildPublicParitySeedPlan(identity.caseId) : buildPeopleSeedPlan(identity.caseId);
        if ('categories' in plan) {
            for (const graph of plan.categories) {
                for (const owner of ['ownerA', 'ownerB'] as const)
                    revisions.set(owner + graph.category, await categoryRevision(owner, graph.category));
                for (const source of graph.lists) {
                    await makeList(source as ListSeed);
                    revisions.set(source.owner + graph.category, await categoryRevision(source.owner, graph.category));
                }
                for (const source of graph.items)
                    if (source.entityKey && !entities.has(source.entityKey))
                        await makeEntity({ key: source.entityKey, title: source.title, details: source.details, suppressed: false, category: graph.category });
                for (const source of graph.items)
                    await makeItem(source as ItemSeed, graph.category);
            }
            for (const link of plan.links) {
                const child = lists.get(link.childCollectionKey)!, parent = lists.get(link.parentCollectionKey)!;
                await recommendations.locationLink(actor('ownerA'), child.id, { expectedChildRevision: await listRevision(child.id, 'ownerA'), locationCollectionId: parent.id, expectedLocationRevision: await listRevision(parent.id, 'ownerA') }, context(), true);
            }
        }
        else {
            for (const source of plan.lists)
                await makeList({ ...source, category: 'people', control: null, details: null });
            for (const source of plan.entities)
                await makeEntity({ key: source.key, title: source.title, category: 'people', details: source.handleSource ? { ...source.details, usernameHandle: options.personas[source.handleSource].handle } : source.details, suppressed: source.suppressed });
            for (const source of plan.recommendations)
                await makeItem({ ...source, control: null, details: plan.entities.find(entity => entity.key === source.entityKey)!.details }, 'people');
        }
        for (const list of lists.values())
            if (list.seed.archived)
                await recommendations.archiveCollection(actor(list.seed.owner), list.id, { expectedRevision: await listRevision(list.id, list.seed.owner) }, context());
    }
    async function captureReceiptBaseline() { const rows = await pool.query("SELECT id FROM application_command_receipts WHERE account_id=ANY($1::uuid[]) AND operation IN('createCollection','createRecommendation','resolvePersonEntity')", [['ownerA', 'ownerB'].map(owner => actor(owner as Owner).accountId)]); for (const row of rows.rows)
        baselineReceipts.add(String(row.id)); }
    async function discoverCreatedPeople() {
        if (expected?.family !== 'people')
            return;
        const fresh = await pool.query("SELECT id,account_id,operation,response->>'id' resource_id FROM application_command_receipts WHERE account_id=ANY($1::uuid[]) AND operation IN('createCollection','createRecommendation','resolvePersonEntity') AND status='completed' AND NOT(id=ANY($2::uuid[])) ORDER BY created_at,id", [['ownerA', 'ownerB'].map(owner => actor(owner as Owner).accountId), [...baselineReceipts]]);
        for (const receipt of fresh.rows) {
            const owner = (['ownerA', 'ownerB'] as const).find(owner => actor(owner).accountId === receipt.account_id);
            if (!owner || typeof receipt.resource_id !== 'string')
                throw refuse();
            const proof = { operation: String(receipt.operation), receiptId: String(receipt.id), accountId: String(receipt.account_id) };
            if (receipt.operation === 'createCollection') {
                if ([...lists.values()].some(value => value.id === receipt.resource_id))
                    continue;
                const native = await row("SELECT id,account_id,category,title,slug,display_order,visibility,publication_state,archived_at FROM collections WHERE id=$1 AND account_id=$2 AND category='people'", [receipt.resource_id, receipt.account_id]);
                const key = 'created-list:' + native.id;
                lists.set(key, { id: native.id, seed: { key, owner, category: 'people', title: native.title, slug: native.slug, displayOrder: native.display_order, control: null, visibility: native.visibility, publicationState: native.publication_state, archived: native.archived_at !== null, details: null } });
                lineage.set(native.id, proof);
            }
            else if (receipt.operation === 'resolvePersonEntity') {
                if ([...entities.values()].some(value => value.id === receipt.resource_id))
                    continue;
                const native = await readPersonEntity(pool, receipt.resource_id);
                if (native.kind !== 'person' || native.origin !== 'manual')
                    throw refuse();
                const key = 'created-entity:' + native.id;
                entities.set(key, { id: native.id, seed: { key, title: native.title, category: 'people', details: native.details, suppressed: native.suppressed } });
                lineage.set(native.id, proof);
            }
        }
        for (const receipt of fresh.rows.filter(row => row.operation === 'createRecommendation')) {
            if ([...items.values()].some(value => value.id === receipt.resource_id))
                continue;
            const owner = (['ownerA', 'ownerB'] as const).find(owner => actor(owner).accountId === receipt.account_id)!;
            const native = await row("SELECT r.id,r.entity_id,r.publication_state,r.archived_at,ci.collection_id,ci.display_order FROM recommendations r LEFT JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.account_id=r.account_id WHERE r.id=$1 AND r.account_id=$2 AND r.category='people'", [receipt.resource_id, receipt.account_id]);
            const entity = [...entities.values()].find(value => value.id === native.entity_id), parent = [...lists.values()].find(value => value.id === native.collection_id);
            if (!entity || native.collection_id !== null && (!parent || parent.seed.owner !== owner) || native.collection_id === null && native.archived_at === null)
                throw refuse();
            const key = 'created-item:' + native.id;
            items.set(key, { id: native.id, category: 'people', collectionId: native.collection_id, entityId: native.entity_id, seed: { key, owner, entityKey: entity.seed.key, collectionKey: parent?.seed.key ?? '', title: entity.seed.title, displayOrder: native.display_order, control: null, publicationState: native.publication_state, archived: native.archived_at !== null, details: entity.seed.details } });
            lineage.set(native.id, { operation: 'createRecommendation', receiptId: receipt.id, accountId: receipt.account_id });
        }
    }
    async function configurePlacesPins() { if (expected?.family !== 'public-parity')
        return; const graph = buildPublicParitySeedPlan(expected.caseId).categories.find(value => value.category === 'places')!, parent = lists.get(graph.targetCollectionKey); if (!parent || parent.seed.owner !== 'ownerA')
        throw refuse(); const selected = [...items.values()].filter(value => value.category === 'places' && value.collectionId === parent.id && value.seed.owner === 'ownerA' && value.seed.control === null).slice(0, 2); if (selected.length !== 2)
        throw refuse(); const command = { operation: 'replacePlacePins' as const, collectionId: parent.id, body: { expectedCollectionRevision: await listRevision(parent.id, 'ownerA'), expectedCategoryContentRevision: await categoryRevision('ownerA', 'places'), orderedRecommendationIds: selected.map(value => value.id) } }; guard(); const result = await retain(options.placePins.execute(actor('ownerA'), command, context(), Buffer.byteLength(JSON.stringify(command.body), 'utf8'))); guard(); const parsed = placePinsResultSchema.parse(result); if (parsed.collectionId !== parent.id || parsed.pinCount !== 2)
        throw refuse(); }
    async function upload(purpose: 'recommendation' | 'collection' | 'guide' | 'feed', bytes: Buffer, mimeType: 'image/png' | 'video/mp4') {
        guard();
        const operation = new MediaService(pool, storage).createMediaOwned(actor('ownerA'), { purpose, bytes, mimeType, length: bytes.length, filename: mimeType === 'image/png' ? 'parity.png' : 'parity.mp4' }, context(), async (_db, media) => { mediaIds.add(media.id); });
        try {
            return await retain(operation.completion);
        }
        finally {
            await retain(operation.settlement);
        }
    }
    async function attachMedia() {
        if (expected?.family !== 'public-parity')
            return;
        for (const category of ['books', 'movies', 'games', 'apps', 'places'] as const) {
            const target = [...items.values()].find(value => value.category === category && value.seed.owner === 'ownerA' && value.seed.control === null);
            if (!target)
                throw refuse();
            const media = await upload('recommendation', png, 'image/png');
            await recommendations.updateRecommendation(actor('ownerA'), target.id, { expectedRevision: Number((await row('SELECT revision FROM recommendations WHERE id=$1 AND account_id=$2', [target.id, actor('ownerA').accountId])).revision), mediaIds: [media.id] }, context());
            if (category === 'movies') {
                const second = [...items.values()].find(value => value.category === category && value.seed.owner === 'ownerA' && value.seed.control === null && value.id !== target.id);
                if (!second)
                    throw refuse();
                await recommendations.updateRecommendation(actor('ownerA'), second.id, { expectedRevision: Number((await row('SELECT revision FROM recommendations WHERE id=$1 AND account_id=$2', [second.id, actor('ownerA').accountId])).revision), mediaIds: [media.id] }, context());
            }
        }
        for (const category of ['products', 'people', 'guides', 'places', 'apps'] as const) {
            const target = [...lists.values()].find(value => value.seed.category === category && value.seed.owner === 'ownerA' && value.seed.control === null);
            if (!target)
                throw refuse();
            const media = await upload('collection', png, 'image/png');
            if (category === 'guides') {
                const revision = Number(await categoryRevision('ownerA', 'guides'));
                await transaction(db => attachGuideCover(db, target.id, actor('ownerA').accountId, revision, media.id));
            }
            else
                await recommendations.updateCollection(actor('ownerA'), target.id, { expectedRevision: await listRevision(target.id, 'ownerA'), coverMediaId: media.id }, context());
        }
        const section = [...items.values()].find(value => value.category === 'guides' && value.seed.owner === 'ownerA' && value.seed.control === null);
        if (!section)
            throw refuse();
        const photo = await upload('guide', png, 'image/png'), nativeSection = await row('SELECT title,description,blocks FROM guide_sections WHERE id=$1 AND collection_id=$2 AND account_id=$3', [section.id, section.collectionId, actor('ownerA').accountId]), blocks = guideSectionBlocksSchema.parse(nativeSection.blocks);
        if (blocks.timeline.morning.length !== 1 || blocks.timeline.morning[0].source !== 'manual' || blocks.timeline.morning[0].verified || blocks.timeline.morning[0].photos.length)
            throw refuse();
        blocks.timeline.morning[0].photos.push({ mediaId: photo.id, fileName: 'parity.png', width: 8, height: 8, aspectRatio: '1:1' });
        const revision = Number(await categoryRevision('ownerA', 'guides'));
        await transaction(db => updateGuideSection(db, section.collectionId, actor('ownerA').accountId, revision, section.id, { title: nativeSection.title, description: nativeSection.description, blocks: guideSectionBlocksSchema.parse(blocks) }));
        guard();
        const video = await retain(readFile(videoUrl));
        guard();
        if (video.length !== 1440 || createHash('sha256').update(video).digest('hex') !== videoHash)
            throw refuse();
        const media = await upload('feed', video, 'video/mp4'), profile = await profiles.getMyProfile(actor('ownerA'));
        if (profile.feedItems.length)
            throw refuse();
        await profiles.updateAccount(actor('ownerA'), { expectedRevision: profile.revision, feedItems: [{ mediaId: media.id, externalUrl: null, source: 'manual', type: 'video', caption: 'Public parity video', details: { fileName: 'parity.mp4', width: 16, height: 16, aspectRatio: '1:1' } }] }, context());
    }
    async function snapshotMedia() {
        const result: any[] = [];
        for (const id of mediaIds) {
            const native = await row("SELECT m.id,m.account_id,m.purpose,m.status,m.mime_type,m.byte_size,encode(o.content_sha256,'hex') sha256,o.object_key,o.variant,o.storage_environment FROM media_assets m JOIN media_objects o ON o.media_id=m.id AND o.variant='original' WHERE m.id=$1 AND m.account_id=$2", [id, actor('ownerA').accountId]);
            const attachments: any[] = [];
            const covers = await pool.query('SELECT cm.account_id,cm.collection_id,c.category FROM collection_media cm JOIN collections c ON c.id=cm.collection_id AND c.account_id=cm.account_id WHERE cm.media_id=$1 AND cm.account_id=$2', [id, native.account_id]);
            for (const value of covers.rows) {
                if (![...lists.values()].some(list => list.id === value.collection_id))
                    throw refuse();
                attachments.push({ accountId: value.account_id, category: value.category, collectionId: value.collection_id, subresourceId: null, slot: value.category === 'guides' ? 'guide-cover' : 'collection-cover', position: 0 });
            }
            const recommendations = await pool.query('SELECT rm.account_id,rm.recommendation_id,rm.display_order,ci.collection_id,r.category FROM recommendation_media rm JOIN recommendations r ON r.id=rm.recommendation_id AND r.account_id=rm.account_id JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.account_id=r.account_id WHERE rm.media_id=$1 AND rm.account_id=$2 ORDER BY ci.collection_id,ci.display_order', [id, native.account_id]);
            for (const value of recommendations.rows) {
                if (![...items.values()].some(item => item.id === value.recommendation_id))
                    throw refuse();
                attachments.push({ accountId: value.account_id, category: value.category, collectionId: value.collection_id, subresourceId: value.recommendation_id, slot: 'recommendation-media', position: value.display_order });
            }
            const sections = await pool.query('SELECT gp.account_id,gp.section_id,s.collection_id,s.blocks FROM guide_section_photos gp JOIN guide_sections s ON s.id=gp.section_id AND s.account_id=gp.account_id WHERE gp.media_id=$1 AND gp.account_id=$2 ORDER BY s.display_order', [id, native.account_id]);
            for (const value of sections.rows) {
                if (![...items.values()].some(item => item.id === value.section_id && item.category === 'guides' && item.collectionId === value.collection_id))
                    throw refuse();
                const blocks = guideSectionBlocksSchema.parse(value.blocks), photos = [...blocks.timeline.morning, ...blocks.timeline.afternoon, ...blocks.timeline.evening, ...blocks.activities.activities, ...blocks.stay.accommodations].flatMap(place => place.photos), photo = photos.find(photo => photo.mediaId === id);
                if (!photo)
                    throw refuse();
                attachments.push({ accountId: value.account_id, category: 'guides', collectionId: value.collection_id, subresourceId: value.section_id, slot: 'guide-section-photo', position: photos.findIndex(photo => photo.mediaId === id), photo });
            }
            const feed = await pool.query('SELECT account_id,display_order FROM profile_feed_items WHERE media_id=$1 AND account_id=$2 ORDER BY display_order', [id, native.account_id]);
            for (const value of feed.rows)
                attachments.push({ accountId: value.account_id, category: null, collectionId: null, subresourceId: null, slot: 'feed-media', position: value.display_order });
            result.push({ id: native.id, accountId: native.account_id, purpose: native.purpose, status: native.status, mimeType: native.mime_type, byteLength: Number(native.byte_size), sha256: native.sha256, keyPath: native.object_key, variant: native.variant, environment: native.storage_environment, contentUrl: expected!.origin + '/api/explorers/v1/media/' + id + '/content', attachments });
        }
        return result;
    }
    async function readEntity(value: AllocatedEntity) { switch (value.seed.category) {
        case 'books': return readBookEntity(pool, value.id);
        case 'movies': return readMovieEntity(pool, value.id);
        case 'apps': return readAppEntity(pool, value.id);
        case 'products': return readProductEntity(pool, value.id);
        case 'people': return readPersonEntity(pool, value.id);
        case 'places': return readPlaceEntity(pool, value.id);
        case 'games': {
            const native = await row('SELECT id,kind,title,origin FROM entities WHERE id=$1', [value.id]);
            return { id: String(native.id), kind: 'game' as const, title: String(native.title), origin: native.origin as 'manual' | 'provider', details: manualGamePresentationSchema.parse(value.seed.details) };
        }
        default: throw refuse();
    } }
    async function snapshot(stage: 'issued' | 'observed'): Promise<PublicParityIssuedManifest | PublicParityObservation> {
        if (!expected)
            throw refuse();
        const plan = expected.family === 'public-parity' ? buildPublicParitySeedPlan(expected.caseId) : buildPeopleSeedPlan(expected.caseId), personas: any = {};
        for (const owner of ['ownerA', 'ownerB'] as const) {
            const native = await row('SELECT id,handle,display_name,revision,status,public_profile FROM creator_accounts WHERE id=$1', [actor(owner).accountId]);
            personas[owner] = { userId: actor(owner).userId, accountId: native.id, handle: native.handle, displayName: native.display_name, accountRevision: Number(native.revision), status: native.status, publicProfile: native.public_profile };
        }
        const categories: any[] = [];
        for (const category of 'categories' in plan ? plan.categories.map(graph => graph.category) : ['people'] as const) {
            const graphPlan = 'categories' in plan ? plan.categories.find(graph => graph.category === category) : null, categoryVisible: any = {}, accountRevisions: any = {};
            for (const owner of ['ownerA', 'ownerB'] as const) {
                const native = await row("SELECT s.is_public,coalesce(c.revision::text,'0') content_revision,p.revision pin_revision FROM account_category_settings s LEFT JOIN account_category_content_state c ON c.account_id=s.account_id AND c.category=s.category LEFT JOIN account_category_pin_state p ON p.account_id=s.account_id AND p.category=s.category WHERE s.account_id=$1 AND s.category=$2", [actor(owner).accountId, category]);
                categoryVisible[owner] = native.is_public;
                accountRevisions[owner] = { contentRevision: native.content_revision, pinRevision: native.pin_revision === null ? null : Number(native.pin_revision) };
            }
            const nativeLists: any[] = [], nativeEntities: any[] = [], nativeItems: any[] = [];
            for (const value of lists.values())
                if (value.seed.category === category) {
                    const native = await row('SELECT id,account_id,category,title,slug,revision,display_order,pin_order,visibility,publication_state,archived_at FROM collections WHERE id=$1 AND account_id=$2', [value.id, actor(value.seed.owner).accountId]);
                    nativeLists.push({ key: value.seed.key, ...(lineage.has(native.id) ? { creation: lineage.get(native.id) } : {}), id: native.id, accountId: native.account_id, category: native.category, title: native.title, slug: native.slug, revision: Number(native.revision), displayOrder: native.display_order, pinOrder: native.pin_order, control: value.seed.control, visibility: native.visibility, publicationState: native.publication_state, archived: native.archived_at !== null, details: category === 'guides' ? await readGuideDetails(pool, native.id, native.account_id) : category === 'places' ? await readPlaceCollectionDetails(pool, native.id, native.account_id) : null });
                }
            for (const value of entities.values())
                if (value.seed.category === category) {
                    const native = await readEntity(value);
                    nativeEntities.push({ key: value.seed.key, ...(lineage.has(native.id) ? { creation: lineage.get(native.id) } : {}), id: native.id, kind: native.kind, origin: native.origin, title: native.title, details: native.details, suppressed: 'suppressed' in native ? native.suppressed : false });
                }
            const ownerContent = new OwnerContentService(pool, options.authConfig.secret);
            for (const value of items.values())
                if (value.category === category) {
                    const owner = value.seed.owner;
                    if (category === 'guides') {
                        const native = await row('SELECT id,collection_id,account_id,title,display_order,blocks,archived_at FROM guide_sections WHERE id=$1 AND account_id=$2', [value.id, actor(owner).accountId]);
                        nativeItems.push({ key: value.seed.key, ...(lineage.has(native.id) ? { creation: lineage.get(native.id) } : {}), id: native.id, accountId: native.account_id, collectionId: native.collection_id, entityKey: null, entityId: null, revision: Number(await categoryRevision(owner, category)), title: native.title, displayOrder: native.display_order, control: value.seed.control, publicationState: null, archived: native.archived_at !== null, details: guideSectionBlocksSchema.parse(native.blocks), sectorTermId: null, editable: null });
                    }
                    else {
                        const native = await row('SELECT r.id,r.account_id,r.entity_id,r.revision,r.publication_state,r.archived_at,ci.collection_id,ci.display_order FROM recommendations r LEFT JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.account_id=r.account_id WHERE r.id=$1 AND r.account_id=$2', [value.id, actor(owner).accountId]);
                        const editable = await ownerContent.getRecommendation(actor(owner), value.id, { status: 'all' }, true) as any;
                        if (editable.id !== native.id || editable.accountId !== native.account_id || editable.entityId !== native.entity_id || editable.category !== category || editable.revision !== Number(native.revision) || editable.publicationState !== native.publication_state || editable.archived !== (native.archived_at !== null))
                            throw refuse();
                        nativeItems.push({ key: value.seed.key, ...(lineage.has(native.id) ? { creation: lineage.get(native.id) } : {}), id: native.id, accountId: native.account_id, collectionId: native.collection_id, entityKey: [...entities.values()].find(entity => entity.id === native.entity_id)?.seed.key ?? null, entityId: native.entity_id, revision: Number(native.revision), title: editable.displayTitle, displayOrder: native.display_order, control: value.seed.control, publicationState: native.publication_state, archived: native.archived_at !== null, details: category === 'games' ? await readManualGamePresentation(pool, value.id, actor(owner).accountId) : editable.entity.details, sectorTermId: editable.peopleSector?.sector?.id ?? null, editable });
                    }
                }
            const facet = graphPlan?.catalogFacet;
            categories.push({ category, categoryVisible, accountRevisions, traversal: graphPlan?.traversal ?? null, catalogFacet: facet ? { ...facet, providerId: 'providerId' in facet ? facet.providerId : null, entityIds: Object.fromEntries((['ownerA', 'ownerB'] as const).map(owner => [owner, [...new Set(nativeItems.filter(item => item.accountId === actor(owner).accountId && item.control === null && !item.archived && item.publicationState === 'published' && nativeLists.some(list => list.id === item.collectionId && list.visibility === 'public' && list.publicationState === 'published' && !list.archived)).map(item => item.entityId))]])) } : null, lists: nativeLists, entities: nativeEntities, items: nativeItems });
        }
        const links = expected.family === 'public-parity' ? (await pool.query('SELECT account_id,location_collection_id,child_collection_id,child_category FROM collection_location_links WHERE account_id=$1 ORDER BY CASE child_category WHEN $$products$$ THEN 0 WHEN $$people$$ THEN 1 ELSE 2 END,child_collection_id', [actor('ownerA').accountId])).rows.map(value => ({ accountId: value.account_id, locationCollectionId: value.location_collection_id, childCollectionId: value.child_collection_id, childCategory: value.child_category })) : [];
        const taxonomy: any = { people: null, places: null };
        for (const category of expected.family === 'public-parity' ? ['people', 'places'] as const : ['people'] as const) {
            const native = await row("SELECT c.state,c.version,c.default_locale,(SELECT count(*)::int FROM taxonomy_terms t WHERE t.category=c.category) term_count,(SELECT count(*)::int FROM taxonomy_source_mappings m WHERE m.category=c.category) mapping_count,(SELECT r.input_hash FROM taxonomy_import_receipts r WHERE r.category=c.category AND r.catalog_version=c.version ORDER BY r.created_at DESC,r.id DESC LIMIT 1) input_hash FROM taxonomy_catalogs c WHERE c.category=$1", [category]);
            taxonomy[category] = { state: native.state, version: Number(native.version), defaultLocale: native.default_locale, termCount: native.term_count, mappingCount: native.mapping_count, inputHash: native.input_hash, ...(category === 'people' ? { positiveSector: 'unavailable-input-configured-empty' } : {}) };
        }
        const result = { ...expected, stage, personas, categories, links, media: await snapshotMedia(), taxonomy };
        return stage === 'issued' ? publicParityIssuedManifestSchema.parse({ expected, manifest: result }) : publicParityObservationSchema.parse({ expected, observation: result });
    }
    async function retire() { if (!databaseValidated)
        throw refuse(); if (phase === 'resetting' || phase === 'observing' || phase === 'retiring')
        throw refuse(); phase = 'retiring'; try {
        guard();
        await discoverCreatedPeople();
        for (const token of sessionTokens) {
            guard();
            const auth = await retain(options.auth.$context);
            await retain(auth.internalAdapter.deleteSession(token));
            sessionTokens.delete(token);
        }
        for (const owner of ['ownerA', 'ownerB'] as const) {
            const profile = await profiles.getMyProfile(actor(owner));
            if (profile.feedItems.some(item => item.mediaId !== null && mediaIds.has(item.mediaId))) {
                await profiles.updateAccount(actor(owner), { expectedRevision: profile.revision, feedItems: profile.feedItems.filter(item => item.mediaId === null || !mediaIds.has(item.mediaId)).map(({ id, url, ...item }) => ({ ...item, externalUrl: item.mediaId === null ? url : null })) }, context());
            }
        }
        await transaction(async (db) => { for (const owner of ['ownerA', 'ownerB'] as const) {
            const accountId = actor(owner).accountId, listIds = [...lists.values()].filter(value => value.seed.owner === owner).map(value => value.id), recommendationIds = [...items.values()].filter(value => value.seed.owner === owner && value.category !== 'guides').map(value => value.id);
            if (recommendationIds.length && listIds.length)
                await db.query('DELETE FROM collection_items WHERE account_id=$1 AND collection_id=ANY($2::uuid[]) AND recommendation_id=ANY($3::uuid[])', [accountId, listIds, recommendationIds]);
            if (recommendationIds.length)
                await db.query('DELETE FROM recommendations WHERE account_id=$1 AND id=ANY($2::uuid[])', [accountId, recommendationIds]);
            if (listIds.length)
                await db.query('DELETE FROM collections WHERE account_id=$1 AND id=ANY($2::uuid[])', [accountId, listIds]);
        } const ids = [...entities.values()].map(value => value.id); if (ids.length)
            await db.query('DELETE FROM entities WHERE id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM recommendations r WHERE r.entity_id=entities.id)', [ids]); });
        for (const id of mediaIds)
            await retirePublicParityMedia(new MediaService(pool,storage),actor('ownerA'),id,context(),async()=>{const result=await pool.query('SELECT m.status,m.deleted_at IS NOT NULL asset_deleted,o.object_key,o.deleted_at IS NOT NULL object_deleted,o.storage_environment FROM media_assets m JOIN media_objects o ON o.media_id=m.id WHERE m.id=$1 AND m.account_id=$2',[id,actor('ownerA').accountId]);return {assetDeleted:result.rows.length>0&&result.rows.every(row=>row.status==='deleted'&&row.asset_deleted===true),objects:result.rows.map(row=>({deleted:row.object_deleted===true&&row.storage_environment==='local',storageDeleted:deletions.get(row.object_key)==='fulfilled'}))};});
        lists.clear();
        items.clear();
        entities.clear();
        mediaIds.clear();
        deletions.clear();
        baselineReceipts.clear();
        lineage.clear();
        revisions = new Map();
        databaseValidated = false;
        expected = undefined;
        issued = undefined;
        ownerSessionTokens.clear();rotateOwnerA=undefined;
        phase = 'idle';
    }
    catch (error) {
        phase = 'failed';
        throw error;
    } }
    return Object.freeze({ async reset(raw: PublicParityExpectedManifest): Promise<PublicParityMaterializedReset> { if (phase !== 'idle')
            throw refuse(); const identity = publicParityExpectedManifestSchema.parse(raw); guard(); phase = 'resetting'; expected = identity; try {
            await prepare(identity);
            await materialize(identity);
            await configurePlacesPins();
            await attachMedia();
            await captureReceiptBaseline();
            issued = await snapshot('issued') as PublicParityIssuedManifest;
            const sessions = {} as Record<Owner, {
                cookie: string;
            }>;
            for (const owner of ['ownerA', 'ownerB'] as const) {
                guard();
                const auth = await retain(options.auth.$context);
                guard();
                const session = await retain(auth.internalAdapter.createSession(actor(owner).userId, false));
                if (!session)
                    throw refuse();
                sessionTokens.add(session.token);
                ownerSessionTokens.set(owner,session.token);
                guard();
                sessions[owner] = { cookie: `${auth.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256', options.authConfig.secret).update(session.token).digest('base64')}` };
            }
            if(identity.family==='public-parity'&&identity.caseId==='Public parity: logout and account replacement cannot reuse another account public cache') {
                const oldToken=ownerSessionTokens.get('ownerA'); if(!oldToken)throw refuse();
                rotateOwnerA=createPublicParitySessionRotation(async()=>{const rows=await pool.query('SELECT id FROM auth_session WHERE token=$1 AND user_id=$2',[oldToken,actor('ownerA').userId]);return rows.rows.length===0;},async()=>{const native=await row('SELECT a.status,a.onboarding_status,m.role FROM creator_accounts a JOIN account_memberships m ON m.account_id=a.id WHERE a.id=$1 AND m.user_id=$2',[actor('ownerA').accountId,actor('ownerA').userId]);if(native.role!=='owner'||native.status!=='active'||native.onboarding_status!=='complete')throw refuse();},async()=>{guard();const auth=await retain(options.auth.$context);guard();const session=await retain(auth.internalAdapter.createSession(actor('ownerA').userId,false));if(!session||session.token===oldToken)throw refuse();sessionTokens.add(session.token);guard();return Object.freeze({cookie:`${auth.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',options.authConfig.secret).update(session.token).digest('base64')}`});});
            }
            phase = 'issued';
            return Object.freeze({ manifest: issued, sessions: Object.freeze(sessions) });
        }
        catch (error) {
            phase = 'failed';
            throw error;
        } }, async observe(): Promise<PublicParityPrivateObservation> { if (phase !== 'issued')
            throw refuse(); phase = 'observing'; try {
            await discoverCreatedPeople();
            const result = await snapshot('observed') as PublicParityObservation;
            const replacement=await rotateOwnerA?.();
            phase = 'issued';
            return Object.freeze({observation:result,...(replacement?{replacementSessions:Object.freeze({ownerA:replacement})}:{})});
        }
        catch (error) {
            phase = 'failed';
            throw error;
        } }, retire, inspect: () => Object.freeze({ phase, pending: pending.size, clients: clients.size, allocated: { lists: lists.size, entities: entities.size, items: items.size, media: mediaIds.size, sessions: sessionTokens.size } }) });
}

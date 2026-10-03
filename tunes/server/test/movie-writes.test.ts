import {it,expect,vi} from 'vitest';
import {resolveEntitySchema,createRecommendationSchema,updateRecommendationSchema} from '../../shared/explorersContract';
it('accepts Movie identity only and denies caller metadata authority',()=>{const input={kind:'provider',category:'movies',provider:'tmdb',externalKind:'tv',externalId:'42'};expect(resolveEntitySchema.safeParse(input).success).toBe(true);expect(resolveEntitySchema.safeParse({...input,details:{title:'Forged'}}).success).toBe(false);expect(resolveEntitySchema.safeParse({...input,externalKind:'volume'}).success).toBe(false);});
it('strict context belongs to Movies and cannot duplicate provider authority in display overrides',()=>{const base={category:'movies',entityId:'00000000-0000-4000-8000-000000000001',collectionId:'00000000-0000-4000-8000-000000000002',expectedCollectionRevision:1,movieContext:{region:'US',selectedProviderIds:[1]}};expect(createRecommendationSchema.safeParse(base).success).toBe(true);expect(createRecommendationSchema.safeParse({...base,category:'books'}).success).toBe(false);expect(updateRecommendationSchema.safeParse({expectedRevision:1,movieContext:{region:'US',selectedProviderIds:[]}}).success).toBe(true);expect(updateRecommendationSchema.safeParse({expectedRevision:1,displayOverrides:{watchProviders:[1]}}).success).toBe(false);});

import {ExplorersRecommendationRepository} from '../repositories/explorersRecommendationRepository';
it('Movies additions do not grant Books writes authority over Movie-only presentation fields',async()=>{
 const repo=new ExplorersRecommendationRepository({} as any);const db={query:vi.fn()};
 vi.spyOn(repo as any,'command').mockImplementation(async(...args:any[])=>args[4](db));
 vi.spyOn(repo as any,'lockRecommendation').mockResolvedValue({category:'books',entity_id:'00000000-0000-4000-8000-000000000001'});
 await expect(repo.updateRecommendation('a','r',1,{displayOverrides:{director:'Caller movie director'}},'k')).rejects.toMatchObject({status:422});expect(db.query).not.toHaveBeenCalled();
});

it('accepts initial declared manual Movie/TV facts without granting caller provider identities or remote media',()=>{expect(resolveEntitySchema.safeParse({kind:'manual',category:'movies',details:{title:'Manual show',mediaType:'tv',runtimeMinutes:0,seasonCount:0,providerRating:0}}).success).toBe(true);for(const extra of [{externalId:'42'},{posterUrl:'https://image.tmdb.org/t/p/w780/a.jpg'},{watchProviders:{}},{genres:[{providerGenreId:28,name:'Action'}]}])expect(resolveEntitySchema.safeParse({kind:'manual',category:'movies',details:{title:'Manual',...extra}}).success).toBe(false);});

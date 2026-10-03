import {expect,it} from 'vitest';
import {createRecommendationSchema,updateRecommendationSchema,resolveEntitySchema,displayOverridesSchema} from '../../shared/explorersContract';
it('accepts server provider identity only and typed Books context and sparse presentation',()=>{
 expect(resolveEntitySchema.safeParse({kind:'provider',category:'books',provider:'google_books',externalKind:'volume',externalId:'v_1'}).success).toBe(true);
 expect(resolveEntitySchema.safeParse({kind:'provider',category:'books',provider:'google_books',externalKind:'volume',externalId:'v_1',title:'spoof'}).success).toBe(false);
 expect(updateRecommendationSchema.safeParse({expectedRevision:1,bookContext:{buyLinks:[{name:'Bookshop',url:'https://shop.example/a'}]}}).success).toBe(true);
 expect(displayOverridesSchema.safeParse({authors:['Me'],subtitle:null,isbn10:'123456789X'}).success).toBe(true);
 expect(displayOverridesSchema.safeParse({providerRating:5}).success).toBe(false);
 expect(createRecommendationSchema.safeParse({category:'movies',entityId:'00000000-0000-4000-8000-000000000001',collectionId:'00000000-0000-4000-8000-000000000002',expectedCollectionRevision:1,bookContext:{buyLinks:[]}}).success).toBe(false);
});

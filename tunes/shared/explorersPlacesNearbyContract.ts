import {z} from 'zod/v3';

// WP6: GET /api/explorers/v1/places/nearby. Basic provider fields only (name, address,
// location) - never ratings, phones or photos, which are a paid tier and owned facts.
export const placesNearbyQuerySchema=z.object({
 lat:z.coerce.number().finite().min(-90).max(90),
 lng:z.coerce.number().finite().min(-180).max(180),
}).strict().refine(v=>!(v.lat===0&&v.lng===0),{message:'Coordinates are required',path:['lat']});

export const nearbyPlaceSchema=z.object({
 id:z.string().min(1).max(300),
 title:z.string().min(1).max(500),
 subtitle:z.string().max(1000).nullable(),
 lat:z.number().min(-90).max(90),
 lng:z.number().min(-180).max(180),
}).strict();

export const placesNearbyResponseSchema=z.object({
 source:z.enum(['google','osm','none']),
 places:z.array(nearbyPlaceSchema).max(8),
}).strict();

export type PlacesNearbyQuery=z.infer<typeof placesNearbyQuerySchema>;
export type NearbyPlace=z.infer<typeof nearbyPlaceSchema>;
export type PlacesNearbyResponse=z.infer<typeof placesNearbyResponseSchema>;

import { z } from "zod";
import { PUBLIC_RECOMMENDATION_CATEGORIES, type PublicCategory } from "./publicProfilePolicy";

const requestSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,64}$/),
  category: z.enum(PUBLIC_RECOMMENDATION_CATEGORIES),
  limit: z.coerce.number().int().min(1).max(24).default(12),
  cursor: z.string().max(2048).refine(v=>Buffer.byteLength(v,"utf8")<=2048).optional(),
}).strict();

const detailRequestSchema = requestSchema.extend({
  slug: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
});

const usernameSchema = z.string().trim().regex(/^[A-Za-z0-9_.-]{1,64}$/);

export type PublicProfileRequest = { username: string; category: PublicCategory; limit: number; cursor?: string };

export function parsePublicProfileRequest(value: unknown): PublicProfileRequest {
  const p=requestSchema.parse(value);if(p.cursor&&p.category!=='movies'&&p.category!=='games'&&!/^o(?:0|[1-9][0-9]{0,4})$/.test(p.cursor))throw new Error('Invalid cursor');return p;
}

export function parsePublicProfileUsername(value: unknown): string {
  return usernameSchema.parse(value);
}

export type PublicProfileDetailRequest = PublicProfileRequest & { slug: string };

export function parsePublicProfileDetailRequest(value: unknown): PublicProfileDetailRequest {
  const p=detailRequestSchema.parse(value);if(p.cursor&&p.category!=='movies'&&p.category!=='games'&&!/^o(?:0|[1-9][0-9]{0,4})$/.test(p.cursor))throw new Error('Invalid cursor');return p;
}

/** Cursor values are deliberately opaque to callers; only this BFF translates
 * them into Strapi's bounded offset pagination. */
export function publicProfileCursorStart(cursor?: string): number {
  if (!cursor) return 0;
  const start = Number.parseInt(cursor.slice(1), 10);
  if (!Number.isSafeInteger(start) || start < 0 || start > 99_999) {
    throw new Error("invalid public profile cursor");
  }
  return start;
}

export function parsePublicMovieGenreRequest(value:unknown){return requestSchema.omit({category:true}).extend({genreSlug:z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)}).parse(value);}
export function parsePublicPeopleSectorRequest(value:unknown){return requestSchema.omit({category:true}).extend({limit:z.union([z.number().int().min(1).max(24),z.string().regex(/^(?:[1-9]|1[0-9]|2[0-4])$/).transform(Number)]).default(12),sectorSlug:z.string().min(1).max(100).refine(v=>!/[/?#\s\u0000-\u001f]/.test(v))}).parse(value);}

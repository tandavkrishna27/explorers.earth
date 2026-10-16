import {gamesPublicPageSchema} from '../../../../../tunes/shared/explorersGameOwnerContract';
import type {GameList,RecommendedGame} from '../../Games/types';
import {mergePublicPage,type PublicProfilePageSize} from '../api/publicProfilePagination';
import type {PublicPagePayload} from '../api/usePublicPagedResource';
import DOMPurify from "dompurify";

const PUBLIC_RICH_TEXT_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "span",
] as const;

const PUBLIC_RICH_TEXT_ATTRIBUTES = [
  "href",
  "target",
  "rel",
  "class",
  "style",
  "data-list",
] as const;
const SAFE_QUILL_CLASSES = new Set([
  "ql-ui",
  "ql-color-white",
  "ql-color-red",
  "ql-color-orange",
  "ql-color-yellow",
  "ql-color-green",
  "ql-color-blue",
  "ql-color-purple",
  "ql-bg-black",
  "ql-bg-red",
  "ql-bg-orange",
  "ql-bg-yellow",
  "ql-bg-green",
  "ql-bg-blue",
  "ql-bg-purple",
]);
const SAFE_QUILL_LIST_TYPES = new Set(["ordered", "bullet"]);
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });

const isSafeQuillColor = (value: string) => {
  if (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)) return true;

  const functionalColor = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!functionalColor) return false;

  const parts = functionalColor[1].split(",").map((part) => part.trim());
  const expectedLength = value.toLowerCase().startsWith("rgba") ? 4 : 3;
  if (parts.length !== expectedLength) return false;

  const channels = parts.slice(0, 3).map(Number);
  if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    return false;
  }

  if (expectedLength === 4) {
    const alpha = Number(parts[3]);
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return false;
  }

  return true;
};

const retainSafeQuillFormatting = (template: HTMLTemplateElement) => {
  template.content.querySelectorAll<HTMLElement>("[class]").forEach((element) => {
    const safeClasses = element.tagName === "SPAN"
      ? Array.from(element.classList).filter((className) => SAFE_QUILL_CLASSES.has(className))
      : [];

    if (safeClasses.length) {
      element.className = safeClasses.join(" ");
    } else {
      element.removeAttribute("class");
    }
  });

  template.content.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const parsedStyle = document.createElement("span");
    parsedStyle.setAttribute("style", element.getAttribute("style") ?? "");
    const color = parsedStyle.style.getPropertyValue("color").trim();
    const backgroundColor = parsedStyle.style.getPropertyValue("background-color").trim();

    element.removeAttribute("style");
    if (!["SPAN", "STRONG", "B", "EM", "I", "U", "S"].includes(element.tagName)) return;

    if (isSafeQuillColor(color)) element.style.color = color;
    if (isSafeQuillColor(backgroundColor)) {
      element.style.backgroundColor = backgroundColor;
    }

    if (!element.getAttribute("style")) element.removeAttribute("style");
  });

  template.content.querySelectorAll<HTMLElement>("[data-list]").forEach((element) => {
    const listType = element.getAttribute("data-list") ?? "";
    if (element.tagName !== "LI" || !SAFE_QUILL_LIST_TYPES.has(listType)) {
      element.removeAttribute("data-list");
    }
  });

  template.content.querySelectorAll<HTMLUListElement | HTMLOListElement>("ol, ul").forEach((list) => {
    const items = Array.from(list.children);
    if (
      !items.length ||
      items.some((item) => item.tagName !== "LI") ||
      !items.some((item) => item.hasAttribute("data-list"))
    ) {
      return;
    }

    const normalizedLists = document.createDocumentFragment();
    let currentList: HTMLUListElement | HTMLOListElement | null = null;

    items.forEach((item) => {
      const listType = item.getAttribute("data-list");
      const tagName = listType === "bullet"
        ? "UL"
        : listType === "ordered"
          ? "OL"
          : list.tagName;
      if (!currentList || currentList.tagName !== tagName) {
        currentList = document.createElement(tagName.toLowerCase()) as
          | HTMLUListElement
          | HTMLOListElement;
        normalizedLists.append(currentList);
      }
      currentList.append(item);
    });

    list.replaceWith(normalizedLists);
  });
};

export function normalizePublicWebHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;

  const value = raw.trim();
  if (!value || hasControlCharacters(value) || /%0[ad]/i.test(value)) {
    return undefined;
  }

  const candidate = value.startsWith("//")
    ? `https:${value}`
    : /^[a-z][a-z\d+.-]*:/i.test(value)
      ? value
      : `https://${value}`;

  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return candidate;
}

export function normalizePublicEmailHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;

  const value = raw.trim();
  if (!value || hasControlCharacters(value) || /%0[ad]/i.test(value)) {
    return undefined;
  }

  if (/^mailto:/i.test(value)) {
    const address = value.slice(value.indexOf(":") + 1).split("?", 1)[0];
    return EMAIL_ADDRESS_PATTERN.test(address) ? value : undefined;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value) || !EMAIL_ADDRESS_PATTERN.test(value)) {
    return undefined;
  }

  return `mailto:${value}`;
}

export function sanitizePublicRichText(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";

  const sanitized = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [...PUBLIC_RICH_TEXT_TAGS],
    ALLOWED_ATTR: [...PUBLIC_RICH_TEXT_ATTRIBUTES],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });

  const template = document.createElement("template");
  template.innerHTML = sanitized;
  retainSafeQuillFormatting(template);

  template.content.querySelectorAll("a").forEach((anchor) => {
    const rawHref = anchor.getAttribute("href");
    const safeHref = rawHref?.toLowerCase().startsWith("mailto:")
      ? normalizePublicEmailHref(rawHref)
      : normalizePublicWebHref(rawHref);

    if (!safeHref) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      return;
    }

    anchor.setAttribute("href", safeHref);
    if (safeHref.toLowerCase().startsWith("mailto:")) {
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      return;
    }

    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  });

  return template.innerHTML;
}

/** Public DTO adaptation has no owner observation/completion authority. */
export function adaptPublicGamesPage(value:unknown,username:string){
 const page=gamesPublicPageSchema.parse(value);
 const game=(row:typeof page.topPicks[number]):RecommendedGame=>({documentId:row.id,entity_id:row.entityId,igdb_id:null,igdb_slug:null,title:row.title??'Untitled game',cover_url:row.gamePresentation.images[0]?.url??null,cover_url_large:row.gamePresentation.images[0]?.url??null,igdb_image_id:null,summary:null,release_date:null,release_year:null,igdb_rating:null,igdb_rating_count:null,genres:null,platforms:null,developer:null,publisher:null,game_modes:null,screenshot_ids:null,igdb_url:null,user_recommendation_note:row.note?.html??'',user_rating:row.userRating,is_pinned:page.topPicks.some(pin=>pin.id===row.id&&pin.collection.id===row.collection.id),pin_order:page.topPicks.find(pin=>pin.id===row.id&&pin.collection.id===row.collection.id)?.pinPosition??null,display_order:row.displayOrder,media_details:null,game_list:{documentId:row.collection.id,List_Name:row.collection.title,slug:row.collection.slug},game_categories:null,Media:row.gamePresentation.images.map(image=>({documentId:image.mediaId,url:image.url}))});
 const gameLists=page.gameLists.map(list=>({documentId:list.id,List_Name:list.title,list_description:list.description,slug:list.slug,Visibility:true,cover_image:list.coverUrl?{url:list.coverUrl,alternativeText:null}:null,display_order:list.displayOrder,top_picks_heading:list.heading,recommended_games:list.recommendations.map(row=>game(row)),account:{documentId:'',username},nextCursor:list.nextCursor} satisfies GameList&{nextCursor:string|null}));
 return {version:page.version,gameLists,topPicks:page.topPicks.map(row=>game(row)),nextCursor:page.nextCursor};
}
export function gamePageCursor(raw:unknown,detail:boolean):string|null{
 const page=raw as any,cursor=detail?page?.gameLists?.[0]?.nextCursor:page?.nextCursor;
 if(cursor!==null&&(typeof cursor!=='string'||!cursor||new TextEncoder().encode(cursor).length>2048))throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');return cursor;
}
export function mergeGamePage(previous:PublicPagePayload,next:PublicPagePayload,detail:boolean,pageSize:PublicProfilePageSize):PublicPagePayload{
 const merged=mergePublicPage(previous,next,'games',detail,pageSize),cursor=gamePageCursor(next,detail);
 return detail?{...merged,gameLists:[{...(merged.gameLists[0] as object),nextCursor:cursor}]} as PublicPagePayload:{...merged,nextCursor:cursor} as unknown as PublicPagePayload;
}
export async function completeGamesPreviews(raw:unknown,read:(slug:string,cursor:string)=>Promise<unknown>):Promise<PublicPagePayload>{
 const data=raw as any;if(!data||!Array.isArray(data.gameLists)||data.gameLists.length>24)throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');
 let bytes=new TextEncoder().encode(JSON.stringify(data)).length,requests=0;const lists=[];
 if(bytes>64*1024*1024)throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');
 for(const list of data.gameLists){
  if(!list||typeof list.documentId!=='string'||typeof list.slug!=='string'||!Array.isArray(list.recommended_games))throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');
  const rows=[...list.recommended_games],seen=new Set<string>();let cursor=gamePageCursor({gameLists:[list]},true);
  while(cursor!==null){
   if(seen.has(cursor)||++requests>1000)throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');seen.add(cursor);
   const page=await read(list.slug,cursor) as any;bytes+=new TextEncoder().encode(JSON.stringify(page)).length;
   if(bytes>64*1024*1024)throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');
   const next=page?.gameLists?.[0];if(!next||page.gameLists.length!==1||next.documentId!==list.documentId||!Array.isArray(next.recommended_games))throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');
   cursor=gamePageCursor(page,true);if(!next.recommended_games.length&&cursor!==null)throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');rows.push(...next.recommended_games);
  }
  lists.push({...list,recommended_games:rows,nextCursor:null});
 }
 return {...data,gameLists:lists};
}

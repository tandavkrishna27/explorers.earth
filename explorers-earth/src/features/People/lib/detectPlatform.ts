import type {PersonPlatform} from '../../../../../tunes/shared/explorersPersonContract';

const hosts:[RegExp,PersonPlatform][]=[[/(^|\.)instagram\.com$/,'instagram'],[/(^|\.)(x|twitter)\.com$/,'twitter'],[/(^|\.)linkedin\.com$/,'linkedin'],[/(^|\.)github\.com$/,'github'],[/(^|\.)(youtube\.com|youtu\.be)$/,'youtube']];

/** Guesses the stored platform from a profile link; any other valid URL is a website. */
export function detectPlatform(raw:string):PersonPlatform{
 try{const host=new URL(raw).hostname.toLowerCase();return hosts.find(([pattern])=>pattern.test(host))?.[1]??'website';}catch{return 'other';}
}

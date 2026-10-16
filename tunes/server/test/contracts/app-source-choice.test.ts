import {it,expect} from 'vitest';
import {appSourceChoiceSchema} from '../../../shared/explorersAppEnrichmentContract';
const identity={sourceId:'website',sourceIdentity:'https://example.test/',sourceIdentityHash:'a'.repeat(64),canonicalizationVersion:'website-v1'};
const choice={identity,label:'Example website',sourceUrl:'https://example.test/'};
it('accepts only plain display labels and canonical HTTPS choices',()=>{expect(appSourceChoiceSchema.parse(choice)).toEqual(choice);for(const value of [{...choice,label:'<b>website</b>'},{...choice,label:' hidden '},{...choice,label:'bad\nlabel'},{...choice,label:''},{...choice,label:'x'.repeat(121)},{...choice,sourceUrl:'http://example.test/'},{...choice,sourceUrl:'https://example.test'},{...choice,sourceUrl:'https://owner:secret@example.test/'},{...choice,extra:'private'}])expect(appSourceChoiceSchema.safeParse(value).success).toBe(false);});

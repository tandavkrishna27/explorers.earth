import {expect,it} from 'vitest';
import {detectPlatform} from '../detectPlatform';
it.each([
 ['https://www.instagram.com/ada.example/','instagram'],['https://x.com/ada','twitter'],['https://twitter.com/ada','twitter'],
 ['https://www.linkedin.com/in/ada','linkedin'],['https://github.com/ada','github'],['https://www.youtube.com/@ada','youtube'],
 ['https://ada.example','website'],['not a url','other'],
])('%s -> %s',(url,platform)=>expect(detectPlatform(url)).toBe(platform));

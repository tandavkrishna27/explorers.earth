import {describe,expect,it} from 'vitest';
import {THEME_PRESETS,getThemeTokenStyles} from '../themePresets';
import {
 AA_CONTRAST,HERO_TEXT_SCRIM_ALPHA,IMAGE_EXTREMES,contrastRatio,over,pageBackdrops,parseColor,resolveReadableProfileTheme,type Rgb,
} from '../profileReadability';
import type {ThemePresetId,ThemeSettings,WallpaperMode} from '../../types/themeTypes';

const presets=Object.keys(THEME_PRESETS) as ThemePresetId[];
const modes:WallpaperMode[]=['banner-top','full-wallpaper-image','ambient-gradient','solid-color'];
const accents=['#10B981','#000000','#FFFFFF','#FACC15','#F43F5E'];
const rgb=(value:string):Rgb=>{const parsed=parseColor(value);if(!parsed)throw new Error(value);return parsed.rgb;};

type Surface={label:string;text:string;backdrops:Rgb[]};
/** Every (text colour, backdrop) pair a profile can render for one configuration. */
function surfaces(preset:ThemePresetId,mode:WallpaperMode,accent:string):Surface[]{
 const config=THEME_PRESETS[preset],settings:Pick<ThemeSettings,'wallpaperMode'|'accentColor'|'customTextColor'>={wallpaperMode:mode,accentColor:accent};
 const readable=resolveReadableProfileTheme(config,settings);
 const page=pageBackdrops(config.styles,mode,accent,readable.wallpaperScrim?.alpha??0);
 const list:Surface[]=[{label:'page primary',text:readable.primary,backdrops:page},{label:'page secondary',text:readable.secondary,backdrops:page}];
 if(mode==='banner-top'){
  // Identity text over the cover: black overlay at its weakest stop, over any possible image.
  const hero=IMAGE_EXTREMES.map(image=>over([0,0,0],HERO_TEXT_SCRIM_ALPHA,image));
  list.push({label:'header primary',text:readable.headerPrimary,backdrops:hero},{label:'header secondary',text:readable.headerSecondary,backdrops:hero});
  // The bio may overlap the cover or sit on the page: its panel is laid over either.
  const panel=readable.bioScrim!,pageColour=rgb(config.styles.bgPage);
  list.push({label:'bio over cover or page',text:readable.primary,backdrops:[...IMAGE_EXTREMES,pageColour].map(under=>over(pageColour,panel.alpha,under))});
 }else{
  list.push({label:'header primary',text:readable.headerPrimary,backdrops:page},{label:'header secondary',text:readable.headerSecondary,backdrops:page},{label:'bio',text:readable.primary,backdrops:page});
 }
 return list;
}

describe('public profile text contrast',()=>{
 it('covers every preset and layout the theme can produce',()=>{
  expect(presets).toHaveLength(6);expect(modes).toHaveLength(4);
 });

 for(const preset of presets)for(const mode of modes)describe(`${preset} / ${mode}`,()=>{
  for(const accent of accents)
   it(`meets WCAG AA for every text role (accent ${accent})`,()=>{
    for(const surface of surfaces(preset,mode,accent)){
     const text=rgb(surface.text);
     for(const backdrop of surface.backdrops)
      expect(contrastRatio(text,backdrop),`${surface.label}: ${surface.text} on rgb(${backdrop.join(',')})`).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
   });
 });

 it('fixes Minimal Light bio text, which was about 2:1 over the wallpaper and 1:1 over a dark cover',()=>{
  // The old behaviour: dark slate text on a black/65 overlay over the page colour and a 25% cover.
  const slate=rgb('#0F172A'),page=rgb('#F8FAFC');
  const oldWallpaper=over([0,0,0],0.65,over([255,255,255],0.25,page));
  expect(contrastRatio(slate,oldWallpaper)).toBeLessThan(AA_CONTRAST);
  expect(contrastRatio(slate,over([0,0,0],0.9,[0,0,0]))).toBeLessThan(2);
  for(const mode of ['full-wallpaper-image','banner-top'] as const)
   for(const surface of surfaces('minimal-light',mode,'#0F172A'))
    for(const backdrop of surface.backdrops)expect(contrastRatio(rgb(surface.text),backdrop)).toBeGreaterThanOrEqual(AA_CONTRAST);
 });

 it('keeps the dark presets white on dark, as before',()=>{
  for(const preset of presets.filter(id=>id!=='minimal-light'))
   expect(resolveReadableProfileTheme(THEME_PRESETS[preset],{wallpaperMode:'banner-top',accentColor:'#10B981'}).primary).toBe('#FFFFFF');
 });

 it('honours a custom text colour as the owner set it',()=>{
  const dark=THEME_PRESETS['cinematic-dark'];
  expect(resolveReadableProfileTheme(dark,{wallpaperMode:'solid-color',accentColor:'#10B981',customTextColor:'#101010'}).primary).toBe('#101010');
  expect(resolveReadableProfileTheme(dark,{wallpaperMode:'solid-color',accentColor:'#10B981'}).primary).toBe('#FFFFFF');
 });

 it('publishes the resolved colours as the theme tokens components render with',()=>{
  const styles=getThemeTokenStyles({preset:'minimal-light',wallpaperMode:'banner-top'});
  const readable=resolveReadableProfileTheme(THEME_PRESETS['minimal-light'],{wallpaperMode:'banner-top',accentColor:'#0F172A'});
  expect(styles['--text-primary']).toBe(readable.primary);
  expect(styles['--text-primary']).toBe('#0F172A');
  expect(styles['--profile-bio-scrim']).toBe(readable.bioScrim!.color);
  expect(getThemeTokenStyles({preset:'minimal-light',wallpaperMode:'solid-color'})['--profile-bio-scrim']).toBe('transparent');
  expect(getThemeTokenStyles({preset:'minimal-light',wallpaperMode:'full-wallpaper-image'})['--profile-wallpaper-scrim']).toMatch(/^rgba\(248, 250, 252, 0\.\d+\)$/);
 });
});

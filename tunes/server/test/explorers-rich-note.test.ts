import { describe, expect, it } from 'vitest';
import { normalizeRichNote } from '../application/richNote';
import actualQuill from '../../shared/test-fixtures/quill-note-v1.json';
const note=(html:string)=>({version:1,format:'quill-html',html});
describe('server rich-note boundary',()=>{
 it('preserves real Chromium editor output and editable reload semantics',()=>{expect(normalizeRichNote(note(actualQuill.html))).toEqual(note(actualQuill.html));expect(actualQuill.reloadedOps).toEqual(actualQuill.ops);});
 it('retains all supported semantic markup and author whitespace',()=>{
  const html='<h1>Title</h1><h2>二</h2><h3>Three</h3><p><strong><em><u><s> café है 😀 </s></u></em></strong><span style="color: rgb(230, 0, 0); background-color: rgb(255, 255, 0);">color</span></p><ol><li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>A</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>B</li></ol>';
  expect(normalizeRichNote(note(html))).toEqual(note(html));
  expect(normalizeRichNote(note('<p> </p>'))).toEqual(note('<p> </p>'));
 });
 it('preserves the actual emoji embed identity including Quill guard text',()=>{
  const html='<p><span class="ql-emojiblot" data-name="grinning">﻿<span contenteditable="false"><span class="ap ap-grinning">😀</span></span>﻿</span></p>';
  expect(normalizeRichNote(note(html))).toEqual(note(html));
 });
 it.each(['','<p><br></p>'])('normalizes verified empty document %s',html=>expect(normalizeRichNote(note(html))).toBeNull());
 it('rejects unknown versions and keys and retains null',()=>{expect(normalizeRichNote(null)).toBeNull();expect(()=>normalizeRichNote({...note('<p>A</p>'),version:2})).toThrow();expect(()=>normalizeRichNote({...note('<p>A</p>'),owner:'forged'})).toThrow();});
 it.each(['<script>alert(1)</script>','<p onclick="x()">A</p>','<svg><p>A</p></svg>','<p><img src="x"></p>','<span style="color:red; background:url(x)">A</span>','<span class="unknown">A</span>','<p><strong>A</p>','<p a="1" a="2">A</p>','<ol><li data-list="checked">A</li></ol>','<span class="ql-emojiblot" data-name="forged">😀</span>','<span class="ql-emojiblot" data-name="grinning"><span class="ap ap-grinning">😈</span></span>','<a href="javascript:alert(1)">A</a>','<a href="//evil.example">A</a>'])('rejects unsupported or lossy markup %s',html=>expect(()=>normalizeRichNote(note(html))).toThrow(expect.objectContaining({status:422})));
 it('rejects actual UTF8 bytes, nodes and depth without trimming',()=>{
  expect(()=>normalizeRichNote(note(`<p>${'😀'.repeat(65536)}</p>`))).toThrow(expect.objectContaining({status:413}));
  expect(()=>normalizeRichNote(note('<p>'+'<br>'.repeat(10001)+'</p>'))).toThrow(expect.objectContaining({status:413}));
  expect(()=>normalizeRichNote(note('<span>'.repeat(129)+'A'+'</span>'.repeat(129)))).toThrow(expect.objectContaining({status:413}));
  expect(()=>normalizeRichNote(note('<span class="ql-emojiblot" data-name="grinning">'+'<span>'.repeat(5000)+'😀'+'</span>'.repeat(5000)+'</span>'))).toThrow(expect.objectContaining({status:413}));
 });
 it('rejects a forged emoji wrapper with supported text but unsupported child shape',()=>{expect(()=>normalizeRichNote(note('<span class="ql-emojiblot" data-name="grinning"><strong>😀</strong></span>'))).toThrow(expect.objectContaining({status:422}));});
});

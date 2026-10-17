import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script, createContext } from 'node:vm';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, '../../../../explorers-earth/e2e/replatform/music.spec.ts'), 'utf8');
function extracted(name: string, globals: Record<string, unknown> = {}) {
  const file = ts.createSourceFile('music.spec.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) return () => undefined;
  return new Script(ts.transpileModule(`(${declaration.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInContext(createContext(globals));
}
const unavailable = '[music-playlist-native-v1:click=u;appeared=u;disappeared=u;panel=u;dashboard=u;section=u;error=u]';
const identity = { file: 'C:\\checkout\\explorers-earth\\e2e\\replatform\\music.spec.ts', title: 'owner playlists songs queue playback and history preserve transactions', project: { name: 'music-mobile' }, repeatEachIndex: 0, retry: 0 };
function harness() {
  const dom = new JSDOM('<div><section aria-label="Music publication"></section><div role="tablist" aria-label="Music sections"><button id="music-section-playlists" aria-selected="true"></button></div><section id="music-section-playlists-panel"><button aria-label="Open Owned list"></button></section></div>');
  const { window } = dom;
  const actualBoundary = extracted('musicPlaylistNativeBoundary', { window, document: window.document, MutationObserver: window.MutationObserver, Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle.bind(window), setTimeout, clearTimeout });
  const boundary = (action: string) => { if (action === 'start') delete (window as unknown as { __musicPlaylistNativeV1Closed?: boolean }).__musicPlaylistNativeV1Closed; return actualBoundary({ action, expiresAt: Date.now() + 900, leaseExpiresAt: Date.now() + 30000 }); };
  const addPanel = (hidden = false) => {
    const panel = window.document.createElement('section');
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-label', 'Owned list'); panel.hidden = hidden;
    panel.getBoundingClientRect = () => ({ width: 30, height: 30 } as DOMRect);
    window.document.querySelector('#music-section-playlists-panel')!.append(panel);
    return panel;
  };
  return { window, boundary, actualBoundary, addPanel, flush: () => new Promise<void>(resolve => queueMicrotask(resolve)) };
}
describe('actual native playlist passive boundary', () => {
  it('admits only exact first native identity including Windows separators', () => {
    const eligible = extracted('musicPlaylistNativeEligible');
    expect(eligible(identity)).toBe(true);
    expect(eligible({ ...identity, file: '/checkout/explorers-earth/e2e/replatform/music.spec.ts', project: { name: 'music-desktop' } })).toBe(true);
    for (const change of [{ retry: 1 }, { repeatEachIndex: 1 }, { title: `${identity.title} extra` }, { project: { name: 'music-mobile-other' } }, { file: 'other/music.spec.ts' }]) expect(eligible({ ...identity, ...change })).toBe(false);
  });
  it('observes appearance and disappearance during the same window and retires', async () => {
    const h = harness(); h.boundary('start');
    const panel = h.addPanel(); await h.flush(); panel.remove(); await h.flush();
    expect(h.boundary('stop')).toBe('[music-playlist-native-v1:click=0;appeared=1;disappeared=1;panel=absent;dashboard=1;section=1;error=0]');
    expect(h.boundary('stop')).toBe(unavailable);
    h.window.close();
  });
  it('records transient panels in one mutation delivery without retaining names or error text', async () => {
    const h = harness(); h.boundary('start'); const panel = h.addPanel(); panel.remove();
    const alert = h.window.document.createElement('p'); alert.setAttribute('role', 'alert'); alert.textContent = 'private-canary'; h.window.document.querySelector('div')!.append(alert);
    await h.flush(); const marker = h.boundary('stop');
    expect(marker).toBe('[music-playlist-native-v1:click=0;appeared=1;disappeared=1;panel=absent;dashboard=1;section=1;error=1]');
    expect(Buffer.byteLength(marker)).toBeLessThanOrEqual(128); h.window.close();
  });
  it('distinguishes hidden ancestor, visible panel, and untrusted clicks', async () => {
    const h = harness(); h.boundary('start'); h.addPanel();
    h.window.document.querySelector('button[aria-label]')!.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true })); await h.flush();
    expect(h.boundary('stop')).toContain('click=0;appeared=1;disappeared=0;panel=visible');
    h.boundary('start'); (h.window.document.querySelector('#music-section-playlists-panel') as HTMLElement).hidden = true;
    expect(h.boundary('stop')).toContain('panel=hidden;dashboard=1;section=0'); h.window.close();
  });
  it('fails closed on duplicate panels and bounded observation saturation', async () => {
    const h = harness(); h.boundary('start'); h.addPanel(); h.addPanel(); await h.flush(); expect(h.boundary('stop')).toBe(unavailable);
    h.window.document.querySelectorAll('[aria-label="Owned list"]').forEach(node => node.remove());
    h.boundary('start'); const fragment = h.window.document.createDocumentFragment(); for (let i = 0; i < 2050; i++) fragment.append(h.window.document.createElement('i'));
    h.window.document.body.append(fragment); await h.flush(); expect(h.boundary('stop')).toBe(unavailable); h.window.close();
  });
  it('retires on page closure and later mutations cannot restore evidence', async () => {
    const h = harness(); h.boundary('start'); h.window.dispatchEvent(new h.window.Event('pagehide')); h.addPanel(); await h.flush();
    expect(h.boundary('stop')).toBe(unavailable); h.window.close();
  });
  it('observes trusted delivery only for the authored button and its descendants', () => {
    const h = harness(); let listener: EventListener | undefined;
    const add = h.window.document.addEventListener.bind(h.window.document);
    h.window.document.addEventListener = ((name: string, callback: EventListener, options?: boolean) => { if (name === 'click') listener = callback; add(name, callback, options); }) as typeof h.window.document.addEventListener;
    h.boundary('start'); const target = h.window.document.querySelector('button[aria-label]')!;
    listener!({ isTrusted: true, target } as unknown as Event);
    expect(h.boundary('stop')).toContain('click=1;appeared=0;disappeared=0;panel=absent');
    listener!({ isTrusted: true, target } as unknown as Event); expect(h.boundary('stop')).toBe(unavailable); h.window.close();
  });
  it('preserves the original failure and retires before any later action', async () => {
    const file = ts.createSourceFile('music.spec.ts', source, ts.ScriptTarget.Latest, true);
    const call = file.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.arguments[0]?.getText(file) === `'${identity.title}'`) as ts.ExpressionStatement;
    const callback = (call.expression as ts.CallExpression).arguments[1] as ts.ArrowFunction;
    const statements = (callback.body as ts.Block).statements;
    const start = statements.findIndex(statement => statement.getText(file).startsWith('const observeNativePlaylist'));
    const end = statements.findIndex((statement, index) => index > start && ts.isTryStatement(statement));
    const snippet = statements.slice(start, end + 1).map(statement => statement.getText(file)).join('\n');
    const original = new Error('not retained in diagnostics'); const calls: string[] = [], errors: { message: string }[] = [];
    const snapshots = new WeakMap();
    const page = { evaluate: async (_fn: unknown, action: string) => { calls.push(action); return action === 'stop' ? unavailable : null; }, getByRole: () => ({ click: async () => { calls.push('click'); } }) };
    const operation = new Script(ts.transpileModule(`(async () => { ${snippet} })`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInContext(createContext({ page, info: { ...identity, errors }, nativePlaylistSnapshots: snapshots, musicPlaylistNativeEligible: () => true, musicPlaylistNativeCapture: async (_page: unknown, action: string) => page.evaluate(null, action), expect: () => ({ toBeVisible: async () => { calls.push('assert'); throw original; } }) }));
    await expect(operation()).rejects.toBe(original); expect(calls).toEqual(['start', 'click', 'assert', 'stop']); expect(errors).toEqual([]); expect(snapshots.get(page)).toBe(unavailable);
  });
  it('bounds a never settling transport without changing business waits', async () => {
    vi.useFakeTimers();
    try {
      const capture = extracted('musicPlaylistNativeCapture', { setTimeout, clearTimeout, musicPlaylistNativeBoundary: () => null, nativePlaylistUnavailable: new WeakSet() });
      const result = capture({ evaluate: () => new Promise(() => {}) }, 'stop');
      await vi.advanceTimersByTimeAsync(900); expect(await result).toBe(unavailable); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('rejects late admission and prevents installation after stop', () => {
    const h = harness();
    expect(h.actualBoundary({ action: 'start', expiresAt: Date.now() - 1, leaseExpiresAt: Date.now() + 30000 })).toBe(unavailable);
    h.boundary('start'); h.boundary('stop');
    expect(h.actualBoundary({ action: 'start', expiresAt: Date.now() + 900, leaseExpiresAt: Date.now() + 30000 })).toBe(unavailable); h.window.close();
  });
  it('retires a lost transport installation by its finite browser lease', async () => {
    vi.useFakeTimers();
    try { const h = harness(); h.boundary('start'); await vi.advanceTimersByTimeAsync(30000); expect(h.boundary('stop')).toBe(unavailable); expect(vi.getTimerCount()).toBe(0); h.window.close(); }
    finally { vi.useRealTimers(); }
  });
  it('consumes late rejected capture and retirement promises after timeout', async () => {
    vi.useFakeTimers();
    try {
      let rejectLate: (error: Error) => void = () => undefined; let calls = 0;
      const capture = extracted('musicPlaylistNativeCapture', { setTimeout, clearTimeout, musicPlaylistNativeBoundary: () => null, nativePlaylistUnavailable: new WeakSet() });
      const page = { evaluate: () => { calls++; return calls === 1 ? new Promise((_resolve, reject) => { rejectLate = reject; }) : Promise.reject(new Error('private')); } };
      const result = capture(page, 'start'); await vi.advanceTimersByTimeAsync(900); expect(await result).toBe(unavailable);
      rejectLate(new Error('private late')); await Promise.resolve(); expect(calls).toBe(2); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('appends once after the original serialized error only for an exact failed identity', () => {
    const file = ts.createSourceFile('music.spec.ts', source, ts.ScriptTarget.Latest, true);
    const hook = file.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(file) === 'test.afterEach') as ts.ExpressionStatement;
    const callback = (hook.expression as ts.CallExpression).arguments[0] as ts.ArrowFunction;
    const statements = (callback.body as ts.Block).statements;
    const prefix = statements.slice(0, statements.findIndex(statement => ts.isTryStatement(statement))).map(statement => statement.getText(file)).join('\n');
    const snapshots = new WeakMap(), unavailablePages = new WeakSet();
    const retain = new Script(ts.transpileModule(`(({page}, info) => { ${prefix} })`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInContext(createContext({ nativePlaylistSnapshots: snapshots, nativePlaylistUnavailable: unavailablePages, musicPlaylistNativeEligible: extracted('musicPlaylistNativeEligible') }));
    const page = {}, original = { message: 'original' }, info = { ...identity, status: 'failed', errors: [original] };
    snapshots.set(page, unavailable); retain({ page }, info); retain({ page }, info); expect(info.errors).toEqual([original, { message: unavailable }]);
    for (const change of [{ status: 'passed' }, { retry: 1 }, { project: { name: 'other' } }]) { const rejected = { ...identity, status: 'failed', errors: [original], ...change }; snapshots.set(page, unavailable); retain({ page }, rejected); expect(rejected.errors).toEqual([original]); expect(snapshots.has(page)).toBe(false); }
  });
  it('rejects duplicate section IDs and unrelated matching section elements', async () => {
    for (const selector of ['#music-section-playlists', '#music-section-playlists-panel']) {
      const h = harness(); h.boundary('start'); const existing = h.window.document.querySelector(selector)!;
      h.window.document.body.append(existing.cloneNode(true)); await h.flush(); expect(h.boundary('stop')).toBe(unavailable); h.window.close();
    }
    for (const selector of ['#music-section-playlists', '#music-section-playlists-panel']) {
      const h = harness(); h.boundary('start'); h.window.document.body.append(h.window.document.querySelector(selector)!);
      await h.flush(); expect(h.boundary('stop')).toBe(unavailable); h.window.close();
    }
  });
  it('rejects duplicate authored buttons and trusted out of scope delivery', async () => {
    for (const duplicate of [true, false]) {
      const h = harness(); let listener: EventListener | undefined;
      const add = h.window.document.addEventListener.bind(h.window.document);
      h.window.document.addEventListener = ((name: string, callback: EventListener, options?: boolean) => { if (name === 'click') listener = callback; add(name, callback, options); }) as typeof h.window.document.addEventListener;
      h.boundary('start'); const existing = h.window.document.querySelector('button[aria-label]')!;
      const outside = duplicate ? existing.cloneNode(true) : existing;
      h.window.document.body.append(outside); listener!({ isTrusted: true, target: outside } as unknown as Event);
      await h.flush(); expect(h.boundary('stop')).toBe(unavailable); h.window.close();
    }
  });
});

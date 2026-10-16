import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicScrollContinuation } from '../PublicScrollContinuation';
import { usePublicPagedResource } from '../../api/usePublicPagedResource';
import { readPublicPageRows, mergePublicPage } from '../../api/publicProfilePagination';

// Evaluate the actual spec helper, without executing its fixture/bootstrap or registering E2E cases.
const source = readFileSync(resolve(process.cwd(), 'e2e/replatform/books.spec.ts'), 'utf8');
const marked = source.split('// BEGIN BOOKS CONTINUATION CONTRACT')[1]?.split('// END BOOKS CONTINUATION CONTRACT')[0];
const originalAction = source.match(/await page\.getByRole\("button",\{name:"Load more books",exact:true\}\)\.click\(\)/)?.[0];
if (!marked && !originalAction) throw new Error('Books continuation contract source missing');
const executable = ts.transpileModule(marked ?? `async function completeBooksContinuation(page){${originalAction};}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const complete: (page: ReturnType<typeof fakePage>, url: string, title: string) => Promise<void> = new Function(`${executable};return completeBooksContinuation;`)();
const url = 'https://fixture.invalid/ownerB/books/seed-list-0';
const title = 'ownerB seed book 0-29';
function fakePage(click = vi.fn(async () => {}), route = url, observationError?: Error) {
  const locator = (find: () => Element[]) => ({
    count: async () => { if (observationError) throw observationError; return find().length; },
    isVisible: async () => find().some(e => e.isConnected && !e.hasAttribute('hidden') && getComputedStyle(e).display !== 'none'),
    click,
  });
  return {
    url: () => route,
    getByText: (text: string) => locator(() => Array.from(document.querySelectorAll('button')).filter(e => e.textContent === text)),
    getByRole: (_role: string, options: {name: string | RegExp}) => locator(() => Array.from(document.querySelectorAll('button')).filter(e => typeof options.name === 'string' ? (e.getAttribute('aria-label') ?? e.textContent) === options.name : options.name.test(e.getAttribute('aria-label') ?? e.textContent ?? ''))),
    locator: (selector: string) => locator(() => Array.from(document.querySelectorAll(selector))),
  };
}
function rows(start: number, count: number) { return { bookLists: [{ documentId: 'list-0', recommended_books: Array.from({length: count}, (_, i) => ({documentId: `book-${start+i}`, title: `ownerB seed book 0-${start+i}`})) }] }; }
function Harness({next}: {next: () => Promise<unknown>}) {
  const state = usePublicPagedResource({scope:'ownerB:books:list-0',enabled:true,pageSize:24,readFirst:async()=>rows(0,24),readNext:next,readRows:data=>readPublicPageRows(data,'books',true,24),merge:(a,b)=>mergePublicPage(a,b,'books',true,24)});
  const books = (state.data?.bookLists[0] as {recommended_books: {documentId: string; title: string}[]} | undefined)?.recommended_books ?? [];
  return <main>{books.map(row=><button key={row.documentId}>{row.title}</button>)}<PublicScrollContinuation label="books" {...state}/></main>;
}
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
describe('actual Books spec continuation outcome', () => {
  it('accepts real observer completion with merged 24-to-30 rows instead of requiring a removed button', async () => {
    let callback!: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: IntersectionObserverCallback){callback=cb;} observe(){} disconnect(){} });
    const next = vi.fn(async () => rows(24,6));
    render(<Harness next={next}/>);
    await screen.findByRole('button',{name:'Load more books'});
    // The effect only observes once it has a target and a page left to continue, so the
    // button can be committed a tick before the observer is constructed. Waiting for the
    // constructor is the real precondition; assuming the order made this fail with
    // "callback is not a function" on a loaded CI runner.
    await vi.waitFor(() => { if (typeof callback !== 'function') throw new Error('observer not constructed'); });
    await act(async () => callback([{isIntersecting:true} as IntersectionObserverEntry],{} as IntersectionObserver));
    await screen.findByRole('button',{name:title});
    expect(screen.queryByRole('button',{name:'Load more books'})).not.toBeInTheDocument();
    const click = vi.fn(async()=>{throw new Error('detached');});
    await complete(fakePage(click),url,title);
    expect(click).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
  it.each([
    ['busy', '<div aria-busy="true"></div>', url],
    ['remaining continuation', '<button>Load more books</button>', url],
    ['failure Retry', '<p role="status">Couldn’t load more books.</p><button>Retry books</button>', url],
    ['alert', '<p role="alert">Books unavailable</p>', url],
    ['loading', '<span role="status">Loading books</span>', url],
    ['wrong owner', '', 'https://fixture.invalid/ownerA/books/seed-list-0'],
    ['wrong list', '', 'https://fixture.invalid/ownerB/books/seed-list-1'],
    ['wrong origin', '', 'https://other.invalid/ownerB/books/seed-list-0'],
  ])('retains exact action error for visible row plus %s', async (_label, extra, route) => {
    document.body.innerHTML = `<button>${title}</button>${extra}`;
    const failure = new Error('original click failure');
    const click = vi.fn(async()=>{throw failure;});
    await expect(complete(fakePage(click,route),url,title)).rejects.toBe(failure);
    expect(click).toHaveBeenCalledTimes(1);
  });
  it('rejects detached control without required row', async () => {
    const failure = new Error('original missing action');
    await expect(complete(fakePage(vi.fn(async()=>{throw failure;})),url,title)).rejects.toBe(failure);
  });
  it('preserves original click error when catch-path observation throws', async () => {
    const failure = new Error('original click failure');
    const page = fakePage(vi.fn(async()=>{ document.body.innerHTML = `<button>${title}</button>`; throw failure; }));
    let reads = 0;
    page.getByText = () => ({count:async()=>{if (++reads > 1) throw new Error('observation failed');return 0;},isVisible:async()=>true,click:vi.fn()});
    await expect(complete(page,url,title)).rejects.toBe(failure);
  });
  it('accepts exactly the same settled outcome in catch path after automatic completion', async () => {
    const click = vi.fn(async()=>{document.body.innerHTML=`<button>${title}</button>`;throw new Error('detached');});
    await complete(fakePage(click),url,title);
    expect(click).toHaveBeenCalledTimes(1);
  });
  it('ordinary manual continuation remains one action with original final-row obligation', async () => {
    document.body.innerHTML='<button>Load more books</button>';
    const click=vi.fn(async()=>{document.body.innerHTML=`<button>${title}</button>`;});
    await complete(fakePage(click),url,title);
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button',{name:title})).toBeVisible();
  });
});

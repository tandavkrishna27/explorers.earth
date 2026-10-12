import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import {existsSync,readFileSync} from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import AppTopPicksMobileHero from '../../public/AppTopPicksMobileHero';
import AppTopPicksHero from '../../public/AppTopPicksHero';
import userEvent from "@testing-library/user-event";
import { loginSurface, surfaceHarness } from "../../../../navigation/__tests__/surfaceHarness";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const createFn = vi.hoisted(() => vi.fn(async () => ({ id: 'app-1' })));
const ownerFixture = vi.hoisted(() => ({ lists: [] as unknown[] }));
vi.mock('../../../api/appsClient', () => ({ AppsClient: { createCollection: createFn } }));
vi.mock('../../../hooks/useAppsOwner', () => ({ useAppsOwner: () => ({ data: { appLists: ownerFixture.lists }, loading: false, refetch: vi.fn() }), invalidateApps: vi.fn() }));
import AppsHome from "../AppsHome";
// VACUITY GUARD (path): this file's oracles are *extracted from* the Playwright spec, so if
// the spec moves or is emptied the oracles silently stop being the real thing. Assert the
// source is on disk and non-empty before any extraction, by name rather than by ENOENT.
const specFile=path.resolve('e2e/replatform/apps.spec.ts');
expect(existsSync(specFile),`Apps oracle source missing: ${specFile}`).toBe(true);
const specSource=readFileSync(specFile,'utf8');
expect(specSource.length,'Apps oracle source is empty').toBeGreaterThan(0);

/**
 * Evaluate one named function from the real Apps spec against a jsdom stand-in for
 * Playwright's `page`.
 *
 * `helpers` injects the spec-level helpers the extracted function calls but which are not
 * themselves extracted. `hero` used to call `page.goto`/`page.reload` directly; commit
 * 686b6c1e routed both through the spec-level `navigateApps`/`reloadApps`, which close over
 * the Playwright bootstrap census (`appsBootstraps`, `settleAppsBootstrap`) and so cannot be
 * extracted without dragging in the whole browser-settlement machinery. Injecting them as
 * explicit, page-driving stubs keeps the oracle body - every assertion the spec makes -
 * byte-identical to the spec, and confines the substitution to navigation, which a jsdom
 * `page` cannot perform anyway. Extracting the real `navigateApps` would instead mean
 * extracting its transitive closure, which is both larger and more brittle.
 */
function specOracle(name:string,helpers:Record<string,unknown>={}){
 const ast=ts.createSourceFile(specFile,specSource,ts.ScriptTarget.Latest,true);
 const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
 // VACUITY GUARD (extraction): a renamed or deleted oracle must fail by name.
 if(!node)throw Error(`Missing Apps oracle: ${name}`);
 const source=ts.createPrinter().printNode(ts.EmitHint.Unspecified,node,ast);
 expect(source.length,`extracted Apps oracle ${name} is empty`).toBeGreaterThan(0);
 const names=Object.keys(helpers);
 // VACUITY GUARD (injection): an injected stub that the real oracle no longer calls means
 // the substitution has gone stale - fail rather than quietly stub nothing.
 for(const helper of names)expect(source,`${name} no longer calls injected helper ${helper}`).toContain(`${helper}(`);
 const expectStub=(locator:{count():Promise<number>})=>({
  // 500ms, not 100ms: the positive cases settle through a real macrotask and the 100ms
  // budget flaked under full-lane parallelism. The asserted condition is unchanged.
  toHaveCount:async(n:number)=>waitFor(async()=>expect(await locator.count()).toBe(n),{timeout:500}),
  toEqual:(value:unknown)=>expect(locator).toEqual(value),
  toBe:(value:unknown)=>expect(locator).toBe(value),
 });
 const code=ts.transpileModule(source+'\nreturn '+name,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('expect','test',...names,code)(expectStub,{info:()=>({project:{name:'apps-mobile'}})},...names.map(helper=>helpers[helper]));
}

/** Navigation stubs for `hero`, recording the paths the real oracle asks for. */
function appsNavigation(){
 const visited:string[]=[];
 return {visited,helpers:{
  navigateApps:async(page:{goto(path:string):Promise<void>},to:string)=>{visited.push(to);await page.goto(to);},
  reloadApps:async(page:{reload():Promise<void>})=>{await page.reload();},
 }};
}

describe("AppsHome create-list navigation (BUG-3)", () => {
  beforeEach(() => {
    loginSurface();
    navigateSpy.mockClear();
    createFn.mockClear();
    ownerFixture.lists=[];
  });

  it('opens the zero-pin manager through a native keyboard-accessible button', async () => {
    ownerFixture.lists=[{documentId:'list-1',List_Name:'Tools',slug:'tools',recommended_apps:[{documentId:'app-1',title:'Focus Timer',is_pinned:false,platforms:[],screenshots:[]}]}];
    const h=surfaceHarness(<AppsHome />, {initial:{documentId:'acc-1',public_apps:'No'}});await h.ready();
    const button=screen.getByRole('button',{name:/^Manage Top Picks \(0\/1\)/});
    expect(button.tagName).toBe('BUTTON');expect(button.getAttribute('type')).toBe('button');
    button.focus();await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading',{name:'Manage Top Picks (0/15)'})).toBeInTheDocument();
  });

  it('the actual persisted-note oracle renders serialized nonbreaking spaces as exact fixture text',()=>{
    const note={version:1,format:'quill-html',html:'<p>Native&nbsp;Apps&nbsp;thoughts</p>'};
    expect(JSON.stringify(note)).not.toContain('Native Apps thoughts');
    expect(specOracle('renderedNoteText')(note.html)).toBe('Native Apps thoughts');
  });

  it('the actual mobile manager oracle selects one active card among fifteen real cards',async()=>{
    const onManage=vi.fn();const apps=Array.from({length:15},(_,i)=>({documentId:`app-${i}`,title:`App ${i}`,platforms:[],screenshots:[]}));
    const {container}=render(<AppTopPicksMobileHero apps={apps as never} onAppClick={()=>{}} showManageButton onManageClick={onManage}/>);
    expect(within(container).getAllByRole('button',{name:'Manage Top Picks'})).toHaveLength(15);
    const selector='[data-public-category-artwork="true"]';
    type DOMLocator={nodes():HTMLElement[];count():Promise<number>;or(other:DOMLocator):DOMLocator;click():Promise<void>};
    const locator=(nodes:()=>HTMLElement[]):DOMLocator=>({nodes,count:async()=>nodes().length,or:other=>locator(()=>[...new Set([...nodes(),...other.nodes()])]),click:async()=>{expect(nodes()).toHaveLength(1);await userEvent.click(nodes()[0]);}});
    const page={locator:(argument:string)=>{expect(argument).toBe(selector);return{count:async()=>container.querySelectorAll(argument).length,getByRole:(role:string,options:{name:RegExp})=>{expect(role).toBe('button');expect(options.name.source).toBe(/^Manage Top Picks/.source);return locator(()=>Array.from(container.querySelectorAll(argument)).flatMap(card=>within(card as HTMLElement).queryAllByRole('button',options)));}};},getByRole:(role:string,options:{name:RegExp})=>{expect(role).toBe('button');expect(options.name.source).toBe(/^Manage Top Picks \(0\//.source);return locator(()=>within(container).queryAllByRole('button',options));}};
    const first=container.querySelector(selector)!;first.removeAttribute('data-public-category-artwork');
    setTimeout(()=>first.setAttribute('data-public-category-artwork','true'),0);
    const selected=await specOracle('mobileManagerButton')(page);await selected.click();expect(onManage).toHaveBeenCalledTimes(1);
    first.parentElement!.children[1].setAttribute('data-public-category-artwork','true');
    await expect(specOracle('mobileManagerButton')(page)).rejects.toThrow();expect(onManage).toHaveBeenCalledTimes(1);
    container.querySelectorAll(selector).forEach(card=>card.removeAttribute('data-public-category-artwork'));
    const empty=document.createElement('button');empty.textContent='Manage Top Picks (0/15)';empty.onclick=()=>onManage();container.append(empty);
    await (await specOracle('mobileManagerButton')(page)).click();expect(onManage).toHaveBeenCalledTimes(2);
  });

  it('the actual public mobile hero oracle excludes the hidden desktop hero and retains every ordered card',async()=>{
    const previous=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollIntoView');Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});try{
    const apps=Array.from({length:15},(_,i)=>({documentId:`app-${i}`,title:`App ${i}`,platforms:[],screenshots:[]}));
    const {container}=render(<><div style={{display:'none'}}><AppTopPicksHero apps={apps as never} onAppClick={()=>{}}/></div><div><AppTopPicksMobileHero apps={apps as never} onAppClick={()=>{}}/></div></>);
    const desktop=container.firstElementChild as HTMLElement,mobileWrapper=container.lastElementChild as HTMLElement;
    desktop.style.display='block';mobileWrapper.style.display='none';
    const thumbnails=Array.from(desktop.querySelectorAll('button.w-32'));
    expect(thumbnails.map(button=>button.querySelector('img')?.getAttribute('alt'))).toEqual(apps.map(app=>app.title));
    await userEvent.click(thumbnails[1]);await waitFor(()=>expect(within(desktop).getByRole('heading',{level:1,name:apps[1].title})).toBeVisible());
    desktop.style.display='none';mobileWrapper.style.display='block';
    const visible=(node:Element)=>{for(let current:Element|null=node;current;current=current.parentElement)if(getComputedStyle(current).display==='none'||getComputedStyle(current).visibility==='hidden')return false;return true;};
    const select=(argument:string)=>Array.from(container.querySelectorAll(argument.replace(/:visible$/,''))).filter(node=>!argument.endsWith(':visible')||visible(node));
    const images=(nodes:()=>Element[])=>({count:async()=>nodes().length,evaluateAll:async(fn:(nodes:Element[])=>unknown)=>fn(nodes())});
    const page={goto:async()=>{},reload:async()=>{},locator:(argument:string)=>{expect(['[data-public-category-artwork="true"]','[data-public-category-artwork="true"]:visible']).toContain(argument);const nodes=()=>select(argument);return{count:async()=>nodes().length,evaluate:async(fn:(node:Element)=>unknown)=>{expect(nodes()).toHaveLength(1);return fn(nodes()[0]);},locator:(relative:string)=>{expect(relative).toBe('../..');return{locator:(tag:string)=>{expect(tag).toBe('img');return images(()=>Array.from(nodes()[0].parentElement!.parentElement!.querySelectorAll(tag)));}};}};}};
    expect(select('[data-public-category-artwork="true"]')).toHaveLength(2);
    const nav=appsNavigation();
    await specOracle('hero',nav.helpers)(page,'fixture-owner',apps);
    // The oracle's own navigation intent is observed, not silently dropped.
    expect(nav.visited).toEqual(['/fixture-owner/apps']);
    const mobile=select('[data-public-category-artwork="true"]:visible')[0];mobile.parentElement!.children[1].setAttribute('data-public-category-artwork','true');
    await expect(specOracle('hero',appsNavigation().helpers)(page,'fixture-owner',apps)).rejects.toThrow();
    }finally{if(previous)Object.defineProperty(HTMLElement.prototype,'scrollIntoView',previous);else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;}
  });

  it("navigates into the newly created list with justCreatedList state", async () => {
    const h = surfaceHarness(<AppsHome />, { initial: { documentId: "acc-1", public_apps: "No" },
      respond: name => name === "CreateAppList" ? Promise.resolve({}) : undefined,
    });
    await h.ready();

    const newListButtons = await screen.findAllByRole("button", {
      name: /New List/i,
    });
    await userEvent.click(newListButtons[0]);

    await waitFor(() =>
      expect(document.querySelector('input[name="List_Name"]')).toBeTruthy()
    );
    const nameInput = document.querySelector(
      'input[name="List_Name"]'
    ) as HTMLInputElement;
    await userEvent.type(nameInput, "Dev Tools");

    await userEvent.click(screen.getByRole("button", { name: /Create List/i }));

    await waitFor(() => expect(createFn).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/recommendations/apps/app-1", {
        state: { justCreatedList: true },
      })
    );
    expect(h.writes).toEqual([]);
  });
});

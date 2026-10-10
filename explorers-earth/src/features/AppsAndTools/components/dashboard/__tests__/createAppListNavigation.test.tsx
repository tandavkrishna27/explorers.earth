import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import AppTopPicksMobileHero from '../../public/AppTopPicksMobileHero';
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
function specOracle(name:string){const file=path.resolve('e2e/replatform/apps.spec.ts');const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!node)throw Error('Missing Apps oracle');const source=ts.createPrinter().printNode(ts.EmitHint.Unspecified,node,ast);return new Function('expect',ts.transpileModule(source+'\nreturn '+name,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)((locator:{count():Promise<number>})=>({toHaveCount:async(n:number)=>expect(await locator.count()).toBe(n)}));}

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
    const page={locator:(argument:string)=>{expect(argument).toBe(selector);return{count:async()=>container.querySelectorAll(argument).length,getByRole:(role:string,options:{name:RegExp})=>{expect(role).toBe('button');return within(container.querySelector(argument) as HTMLElement).getByRole('button',options);}};},getByRole:()=>{throw Error('Unscoped mobile button');}};
    const selected=await specOracle('mobileManagerButton')(page);await userEvent.click(selected);expect(onManage).toHaveBeenCalledTimes(1);
    const first=container.querySelector(selector)!;first.parentElement!.children[1].setAttribute('data-public-category-artwork','true');
    await expect(specOracle('mobileManagerButton')(page)).rejects.toThrow();expect(onManage).toHaveBeenCalledTimes(1);
    container.querySelectorAll(selector).forEach(card=>card.removeAttribute('data-public-category-artwork'));expect(await specOracle('mobileManagerButton')(page)).toBeUndefined();
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

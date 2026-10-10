import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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

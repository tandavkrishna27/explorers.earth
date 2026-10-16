import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loginSurface, surfaceHarness } from "../../../../navigation/__tests__/surfaceHarness";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const createFn = vi.hoisted(() => vi.fn(async () => ({ id: 'product-1' })));
vi.mock('../../../api/productsClient', () => ({ ProductsClient: { createCollection: createFn } }));
vi.mock('../../../hooks/useProductsOwner', () => ({ useProductsOwner: () => ({ data: { productLists: [] }, loading: false, refetch: vi.fn() }), invalidateProducts: vi.fn() }));
import ProductsHome from "../ProductsHome";

describe("ProductsHome create-list navigation (BUG-3)", () => {
  beforeEach(() => {
    loginSurface();
    navigateSpy.mockClear();
    createFn.mockClear();
  });

  it("navigates into the newly created list with justCreatedList state", async () => {
    const h = surfaceHarness(<ProductsHome />, { initial: { documentId: "acc-1", public_products: "No" },
      respond: name => name === "CreateProductList" ? Promise.resolve({}) : undefined,
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
    await userEvent.type(nameInput, "Kitchen Gear");

    await userEvent.click(screen.getByRole("button", { name: /Create List/i }));

    await waitFor(() => expect(createFn).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith(
        "/recommendations/products/product-1",
        { state: { justCreatedList: true } }
      )
    );
    expect(h.writes).toEqual([]);
  });
});

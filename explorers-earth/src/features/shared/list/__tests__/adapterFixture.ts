import { vi, type Mock } from "vitest";
import type { ListItemView, ListPageAdapter, ListView } from "../listPageAdapter";

type Command<T extends (...args: never[]) => unknown> = Mock<T>;

export type AdapterFixture = Omit<ListPageAdapter, "retry" | "setStatus" | "reorder" | "togglePin" | "removeItem" | "rename" | "archive" | "purge"> & {
  retry: Command<ListPageAdapter["retry"]>;
  setStatus: Command<ListPageAdapter["setStatus"]>;
  reorder: Command<ListPageAdapter["reorder"]>;
  togglePin: Command<ListPageAdapter["togglePin"]>;
  removeItem: Command<ListPageAdapter["removeItem"]>;
  rename: Command<ListPageAdapter["rename"]>;
  archive: Command<ListPageAdapter["archive"]>;
  purge: Command<ListPageAdapter["purge"]>;
};

type Overrides = Partial<Omit<AdapterFixture, "list">> & { list?: ListView | null; status?: ListView["status"] };

const ITEMS: ListItemView[] = [
  { id: "i1", title: "Item one", subtitle: "2001", imageUrl: null, rating: 8, pinned: false },
  { id: "i2", title: "Item two", subtitle: "2002", imageUrl: null, rating: null, pinned: true },
  { id: "i3", title: "Item three", subtitle: "2003", imageUrl: null, rating: 6, pinned: false },
];

// A Movies list "Comfort movies" (draft, three items) with every command a resolved vi.fn().
export function adapterFixture(overrides: Overrides = {}): AdapterFixture {
  const { status, list, ...rest } = overrides;
  const baseList: ListView = {
    id: "list_1", title: "Comfort movies", description: null, slug: "comfort-movies", coverUrl: null,
    status: status ?? "draft", itemCount: ITEMS.length, publicUrl: "https://explorers.earth/smoketest1021/movies/comfort-movies",
  };
  return {
    category: "movies",
    categoryLabel: "Movies & Shows",
    itemNoun: "movie",
    loading: false,
    error: null,
    retry: vi.fn(),
    list: list === undefined ? baseList : list,
    items: ITEMS,
    addPath: "/recommendations/movies/list_1/add",
    editPath: (itemId: string) => `/recommendations/movies/list_1/edit/${itemId}`,
    setStatus: vi.fn().mockResolvedValue(undefined),
    reorder: vi.fn().mockResolvedValue(undefined),
    togglePin: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
    purge: vi.fn().mockResolvedValue(undefined),
    ...rest,
  };
}

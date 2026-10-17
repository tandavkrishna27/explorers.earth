import { act, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  PublicHeaderDescriptorProvider,
  usePublicHeaderDescriptor,
} from "../PublicHeaderDescriptorContext";
import type { PublicHeaderShareDescriptor } from "../publicHeaderDescriptor";

function ActiveDescriptor({ descriptor }: { descriptor?: PublicHeaderShareDescriptor }) {
  const active = usePublicHeaderDescriptor(descriptor);
  return <output data-testid="active">{JSON.stringify(active)}</output>;
}

function RichRegistration({ name }: { name: string }) {
  const location = useLocation();
  usePublicHeaderDescriptor({
    navigationKey: location.key,
    title: name,
    text: `${name} text`,
    url: `https://explorers.earth/alice/books/${name}`,
    analyticsContext: "books-list-header",
    analyticsMetadata: { listId: name, listName: `${name} list`, sector: "film" },
  });
  return null;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <PublicHeaderDescriptorProvider
      origin="https://explorers.earth"
      username="alice"
      profileName="Alice"
    >
      {children}
    </PublicHeaderDescriptorProvider>
  );
}

const readActive = () => JSON.parse(screen.getByTestId("active").textContent || "{}") as PublicHeaderShareDescriptor;

describe("PublicHeaderDescriptorProvider", () => {
  it("publishes the current URL fallback synchronously for search-only and same-path navigation instances", () => {
    function Harness() {
      const navigate = useNavigate();
      return <>
        <ActiveDescriptor />
        <button onClick={() => navigate("/alice/books?utm_source=second&access=secret")}>search</button>
        <button onClick={() => navigate("/alice/books?utm_source=third")}>same path</button>
      </>;
    }

    render(<StrictMode><MemoryRouter initialEntries={["/alice/books?utm_source=first"]}><Wrapper><Harness /></Wrapper></MemoryRouter></StrictMode>);
    expect(readActive().url).toBe("https://explorers.earth/alice/books?utm_source=first");

    act(() => screen.getByRole("button", { name: "search" }).click());
    const secondKey = readActive().navigationKey;
    expect(readActive().url).toBe("https://explorers.earth/alice/books?utm_source=second");

    act(() => screen.getByRole("button", { name: "same path" }).click());
    expect(readActive().url).toBe("https://explorers.earth/alice/books?utm_source=third");
    expect(readActive().navigationKey).not.toBe(secondKey);
  });

  it("lets the newest owner win and ignores cleanup from an older owner in the same navigation instance", () => {
    function Harness() {
      const [showOld, setShowOld] = useState(true);
      return <>
        {showOld && <RichRegistration name="old" />}
        <RichRegistration name="new" />
        <ActiveDescriptor />
        <button onClick={() => setShowOld(false)}>remove old</button>
      </>;
    }

    render(<StrictMode><MemoryRouter initialEntries={["/alice/books"]}><Wrapper><Harness /></Wrapper></MemoryRouter></StrictMode>);
    expect(readActive()).toMatchObject({ title: "new", analyticsMetadata: { listId: "new", listName: "new list", sector: "film" } });

    act(() => screen.getByRole("button", { name: "remove old" }).click());
    expect(readActive()).toMatchObject({ title: "new", analyticsMetadata: { listId: "new", listName: "new list", sector: "film" } });
  });

  it("keeps the provider-owned canonical current URL when richer route data registers", () => {
    function UnsafeRichRegistration() {
      const location = useLocation();
      usePublicHeaderDescriptor({
        navigationKey: location.key,
        title: "Rich list title",
        url: "https://explorers.earth/Alice/BOOKS/List?access=secret&utm_source=raw#capability",
        analyticsContext: "books-list-header",
        analyticsMetadata: { listId: "list-1" },
      });
      return <ActiveDescriptor />;
    }

    render(<StrictMode><MemoryRouter initialEntries={["/alice/books/List?utm_source=safe&token=private"]}><Wrapper><UnsafeRichRegistration /></Wrapper></MemoryRouter></StrictMode>);
    expect(readActive()).toMatchObject({
      title: "Rich list title",
      url: "https://explorers.earth/alice/books/List?utm_source=safe",
      analyticsContext: "books-list-header",
      analyticsMetadata: { listId: "list-1" },
    });
  });

  it("publishes a validated route-enriched URL with current attribution instead of candidate secrets", () => {
    function SelectedCityRegistration() {
      const location = useLocation();
      usePublicHeaderDescriptor({
        navigationKey: location.key,
        title: "Alice's Places",
        text: "Check out these recommendations!",
        url: "https://explorers.earth/Alice/PLACES/Hyderabad?utm_source=forged&access=secret#private",
        analyticsContext: "places-header",
        analyticsMetadata: { city: "Hyderabad" },
      });
      return <ActiveDescriptor />;
    }

    render(<StrictMode><MemoryRouter initialEntries={["/alice/places?utm_medium=share&token=private"]}><Wrapper><SelectedCityRegistration /></Wrapper></MemoryRouter></StrictMode>);
    expect(readActive()).toMatchObject({
      url: "https://explorers.earth/alice/places/Hyderabad?utm_medium=share",
      analyticsContext: "places-header",
      analyticsMetadata: { city: "Hyderabad" },
    });
  });

  it.each([
    "https://evil.example/alice/places/hyderabad",
    "https://explorers.earth/bob/places/hyderabad",
    "https://explorers.earth/alice/books/travel",
    "https://explorers.earth/alice/music/private",
  ])("keeps the current fallback when a route registers unsafe URL %s", (url) => {
    function UnsafeRegistration() {
      const location = useLocation();
      usePublicHeaderDescriptor({
        navigationKey: location.key,
        title: "Unsafe",
        url,
        analyticsContext: "places-header",
      });
      return <ActiveDescriptor />;
    }

    render(<StrictMode><MemoryRouter initialEntries={["/alice/places?utm_source=safe&access=private"]}><Wrapper><UnsafeRegistration /></Wrapper></MemoryRouter></StrictMode>);
    expect(readActive().url).toBe("https://explorers.earth/alice/places?utm_source=safe");
  });

  it("rejects late registration from an old navigation key and restores the new fallback immediately", () => {
    function Harness() {
      const navigate = useNavigate();
      const location = useLocation();
      const [late, setLate] = useState<PublicHeaderShareDescriptor>();
      const oldKey = useState(location.key)[0];
      return <>
        <ActiveDescriptor descriptor={late} />
        <button onClick={() => navigate("/alice/music?utm_medium=share")}>navigate</button>
        <button onClick={() => setLate({
          navigationKey: oldKey,
          title: "stale",
          url: "https://explorers.earth/alice/books/stale",
          analyticsContext: "books-list-header",
        })}>publish late</button>
      </>;
    }

    render(<StrictMode><MemoryRouter initialEntries={["/alice/books"]}><Wrapper><Harness /></Wrapper></MemoryRouter></StrictMode>);
    act(() => screen.getByRole("button", { name: "navigate" }).click());
    expect(readActive()).toMatchObject({ title: "Alice's Music", url: "https://explorers.earth/alice/music?utm_medium=share" });

    act(() => screen.getByRole("button", { name: "publish late" }).click());
    expect(readActive()).toMatchObject({ title: "Alice's Music", url: "https://explorers.earth/alice/music?utm_medium=share" });
  });

  it("is idempotent for inline descriptors under Strict Mode without update-depth warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renders = 0;
    function Inline() {
      const location = useLocation();
      renders += 1;
      return <ActiveDescriptor descriptor={{
        navigationKey: location.key,
        title: "Inline",
        url: "https://explorers.earth/alice/books",
        analyticsContext: "books-header",
      }} />;
    }

    render(<StrictMode><MemoryRouter initialEntries={["/alice/books"]}><Wrapper><Inline /></Wrapper></MemoryRouter></StrictMode>);
    expect(readActive().title).toBe("Inline");
    expect(renders).toBeLessThan(10);
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/maximum update depth/i);
    consoleError.mockRestore();
  });
});

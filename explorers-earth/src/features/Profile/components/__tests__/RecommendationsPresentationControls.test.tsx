import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createInstance } from "i18next";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { DragControls, MotionConfig } from "framer-motion";
import RecommendationsPresentationControls from "../RecommendationsPresentationControls";
import type { RecommendationCategoryId } from "../../types/themeTypes";
import arResource from "../../../../i18n/resources/ar.json";
import heResource from "../../../../i18n/resources/he.json";

const INDEX_CSS = readFileSync(
  resolve(__dirname, "../../../../index.css"),
  "utf8",
);

const CANONICAL_ORDER: RecommendationCategoryId[] = [
  "places",
  "music",
  "movies",
  "books",
  "games",
  "guides",
  "apps",
  "products",
  "people",
];

const GESTURE_INFO = {
  delta: { x: 0, y: 0 },
  offset: { x: 0, y: 0 },
  point: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
};

interface InstrumentedDragSubscriber {
  getProps: () => {
    onDragEnd?: (event: PointerEvent, info: typeof GESTURE_INFO) => void;
    onDragStart?: (event: PointerEvent, info: typeof GESTURE_INFO) => void;
  };
}

const instrumentedCallbacksFor = (
  controls: DragControls,
  pointerId: number,
) => {
  const subscribers = (
    controls as unknown as {
      componentControls: Set<InstrumentedDragSubscriber>;
    }
  ).componentControls;
  expect(subscribers.size).toBe(1);
  const subscriber = [...subscribers][0];
  const event = new Event("pointermove", { bubbles: true }) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: pointerId });
  const props = subscriber.getProps();
  return {
    end: () => props.onDragEnd?.(event, GESTURE_INFO),
    start: () => props.onDragStart?.(event, GESTURE_INFO),
  };
};

const subscriberCount = (controls: DragControls) =>
  (
    controls as unknown as {
      componentControls: Set<InstrumentedDragSubscriber>;
    }
  ).componentControls.size;

describe("RecommendationsPresentationControls", () => {
  it("offers all three layouts without adding visibility controls", () => {
    render(
      <RecommendationsPresentationControls value={undefined} onChange={vi.fn()} />,
    );

    expect(
      screen.getByRole("radio", { name: "Classic Shelves" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Category Mosaic" }),
    ).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "Featured First" }),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Public Visibility controls whether a category appears.",
      ),
    ).not.toBeInTheDocument();
  });

  it("emits the complete normalized order when the layout changes", () => {
    const onChange = vi.fn();
    render(
      <RecommendationsPresentationControls value={undefined} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Category Mosaic" }));

    expect(onChange).toHaveBeenLastCalledWith({
      layout: "grid",
      categoryOrder: CANONICAL_ORDER,
    });
  });

  it("moves a category, retains button focus, and announces its position", () => {
    const onChange = vi.fn();
    render(
      <RecommendationsPresentationControls value={undefined} onChange={onChange} />,
    );
    const moveDown = screen.getByRole("button", { name: "Move Places down" });

    moveDown.focus();
    fireEvent.click(moveDown);

    expect(onChange).toHaveBeenLastCalledWith({
      layout: "shelves",
      categoryOrder: [
        "music",
        "places",
        "movies",
        "books",
        "games",
        "guides",
        "apps",
        "products",
        "people",
      ],
    });
    expect(moveDown).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Places moved to position 2 of 9",
    );
  });

  it("disables only the unavailable boundary moves", () => {
    render(
      <RecommendationsPresentationControls value={undefined} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Move Places up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Places down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move People up" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move People down" })).toBeDisabled();
  });

  it("gives every category a localized handle and linked keyboard instructions", () => {
    render(
      <RecommendationsPresentationControls value={undefined} onChange={vi.fn()} />,
    );

    const handles = CANONICAL_ORDER.map((id) => {
      const label = {
        places: "Places",
        music: "Music",
        movies: "Movies & Shows",
        books: "Books",
        games: "Games",
        guides: "Guides",
        apps: "Apps & Tools",
        products: "Products",
        people: "People",
      }[id];
      return screen.getByRole("button", { name: `Drag ${label}` });
    });

    expect(new Set(handles.map((handle) => handle.getAttribute("aria-label"))))
      .toHaveLength(9);
    for (const handle of handles) {
      expect(handle).toHaveAttribute("type", "button");
      expect(handle).toHaveStyle({ touchAction: "none" });
      const descriptionId = handle.getAttribute("aria-describedby");
      expect(descriptionId).toBeTruthy();
      expect(document.getElementById(descriptionId!)).toHaveTextContent(
        "Press Space or Enter to lift. Use Arrow keys or Home and End to move. Press Space or Enter to drop, or Escape to cancel.",
      );
    }
  });

  it("starts mouse reordering from the whole row while preserving actions and touch scrolling", () => {
    const start = vi
      .spyOn(DragControls.prototype, "start")
      .mockImplementation(() => undefined);
    const onChange = vi.fn();
    const { container } = render(
      <RecommendationsPresentationControls value={undefined} onChange={onChange} />,
    );

    const label = screen.getByText("Places", {
      selector: ".appearance-category-label",
    });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Move Places down" }), {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerDown(screen.getByRole("region", {
      name: "Recommendations layout preview",
    }), {
      button: 0,
      isPrimary: true,
      pointerId: 2,
      pointerType: "mouse",
    });
    fireEvent.pointerDown(label, {
      button: 0,
      isPrimary: true,
      pointerId: 3,
      pointerType: "touch",
    });
    expect(start).not.toHaveBeenCalled();

    fireEvent.pointerDown(label, {
      button: 0,
      isPrimary: true,
      pointerId: 4,
      pointerType: "mouse",
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll(".appearance-category-row")).toHaveLength(9);
    expect(onChange).not.toHaveBeenCalled();
    start.mockRestore();
  });

  it("does not start a second pointer transaction while a handle is lifted", () => {
    const start = vi
      .spyOn(DragControls.prototype, "start")
      .mockImplementation(() => undefined);
    render(
      <RecommendationsPresentationControls
        value={undefined}
        onChange={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Drag Places" }), {
      key: " ",
    });
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Drag Music" }),
      { button: 0, isPrimary: true, pointerId: 2 },
    );

    expect(start).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Drag Places" }))
      .toHaveAttribute("aria-pressed", "true");
    start.mockRestore();
  });

  it("reserves pointer ownership before Framer reports the drag threshold", () => {
    const start = vi
      .spyOn(DragControls.prototype, "start")
      .mockImplementation(() => undefined);
    const { unmount } = render(
      <RecommendationsPresentationControls value={undefined} onChange={vi.fn()} />,
    );

    try {
      fireEvent.pointerDown(screen.getByRole("button", { name: "Drag Places" }), {
        button: 0,
        isPrimary: true,
        pointerId: 101,
      });
      const controlsA = start.mock.contexts[0] as unknown as DragControls;
      const callbacksA = instrumentedCallbacksFor(controlsA, 101);
      fireEvent.pointerDown(screen.getByRole("button", { name: "Drag Music" }), {
        button: 0,
        isPrimary: true,
        pointerId: 102,
      });

      expect(start).toHaveBeenCalledTimes(1);

      fireEvent.pointerUp(screen.getByRole("button", { name: "Drag Places" }), {
        pointerId: 101,
      });
      act(() => callbacksA.start());
      expect(screen.getByRole("button", { name: "Drag Places" }))
        .toHaveAttribute("aria-pressed", "false");
      fireEvent.pointerDown(screen.getByRole("button", { name: "Drag Music" }), {
        button: 0,
        isPrimary: true,
        pointerId: 103,
      });

      expect(start).toHaveBeenCalledTimes(2);
      const controlsB = start.mock.contexts[1] as unknown as DragControls;
      const callbacksB = instrumentedCallbacksFor(controlsB, 103);
      fireEvent.pointerCancel(
        screen.getByRole("button", { name: "Drag Music" }),
        { pointerId: 103 },
      );
      act(() => callbacksB.start());
      expect(screen.getByRole("button", { name: "Drag Music" }))
        .toHaveAttribute("aria-pressed", "false");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Drag Places" }), {
        button: 0,
        isPrimary: true,
        pointerId: 104,
      });
      expect(start).toHaveBeenCalledTimes(3);
    } finally {
      unmount();
      start.mockRestore();
    }
  });

  it("rejects a stale row drag-end after a newer pointer session begins", () => {
    const start = vi
      .spyOn(DragControls.prototype, "start")
      .mockImplementation(() => undefined);
    const onChange = vi.fn();
    const { unmount } = render(
      <RecommendationsPresentationControls value={undefined} onChange={onChange} />,
    );

    try {
      const places = screen.getByRole("button", { name: "Drag Places" });
      fireEvent.pointerDown(places, {
        button: 0,
        isPrimary: true,
        pointerId: 201,
      });
      const controlsA = start.mock.contexts[0] as unknown as DragControls;
      const callbacksA = instrumentedCallbacksFor(controlsA, 201);
      act(() => callbacksA.start());

      fireEvent.pointerCancel(places, { pointerId: 201 });
      const music = screen.getByRole("button", { name: "Drag Music" });
      fireEvent.pointerDown(music, {
        button: 0,
        isPrimary: true,
        pointerId: 202,
      });
      const controlsB = start.mock.contexts[1] as unknown as DragControls;
      const callbacksB = instrumentedCallbacksFor(controlsB, 202);
      act(() => callbacksB.start());

      act(() => callbacksA.end());
      expect(music).toHaveAttribute("aria-pressed", "true");
      expect(onChange).not.toHaveBeenCalled();

      act(() => callbacksB.end());
      expect(music).toHaveAttribute("aria-pressed", "false");
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      unmount();
      start.mockRestore();
    }
  });

  it("rolls back the owned pointer transaction on a native touchcancel", () => {
    const start = vi
      .spyOn(DragControls.prototype, "start")
      .mockImplementation(() => undefined);
    const onChange = vi.fn();
    const { unmount } = render(
      <RecommendationsPresentationControls value={undefined} onChange={onChange} />,
    );

    try {
      const places = screen.getByRole("button", { name: "Drag Places" });
      fireEvent.pointerDown(places, {
        button: 0,
        isPrimary: true,
        pointerId: 205,
      });
      const controls = start.mock.contexts[0] as unknown as DragControls;
      const callbacks = instrumentedCallbacksFor(controls, 205);
      act(() => callbacks.start());
      expect(places).toHaveAttribute("aria-pressed", "true");

      fireEvent.touchCancel(places);
      expect(places).toHaveAttribute("aria-pressed", "false");
      act(() => callbacks.end());
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      unmount();
      start.mockRestore();
    }
  });

  it.each(["pointercancel", "inactive", "scope", "unmount"] as const)(
    "stops and cancels the owned Framer session before detach on %s",
    (reason) => {
      const originalStop = DragControls.prototype.stop;
      const originalCancel = DragControls.prototype.cancel;
      const stopSubscriberCounts: number[] = [];
      const cancelSubscriberCounts: number[] = [];
      const start = vi
        .spyOn(DragControls.prototype, "start")
        .mockImplementation(() => undefined);
      const stop = vi
        .spyOn(DragControls.prototype, "stop")
        .mockImplementation(function (this: DragControls) {
          stopSubscriberCounts.push(subscriberCount(this));
          originalStop.call(this);
        });
      const cancel = vi
        .spyOn(DragControls.prototype, "cancel")
        .mockImplementation(function (this: DragControls) {
          cancelSubscriberCounts.push(subscriberCount(this));
          originalCancel.call(this);
        });
      const onChange = vi.fn();
      const rendered = render(
        <RecommendationsPresentationControls
          value={undefined}
          isActive
          scopeKey="account-a"
          onChange={onChange}
        />,
      );

      try {
        const places = screen.getByRole("button", { name: "Drag Places" });
        const pointerId = 301;
        fireEvent.pointerDown(places, {
          button: 0,
          isPrimary: true,
          pointerId,
        });
        const owner = start.mock.contexts[0] as unknown as DragControls;
        const callbacks = instrumentedCallbacksFor(owner, pointerId);
        act(() => callbacks.start());

        if (reason === "pointercancel") {
          fireEvent.pointerCancel(places, { pointerId });
        } else if (reason === "inactive") {
          rendered.rerender(
            <RecommendationsPresentationControls
              value={undefined}
              isActive={false}
              scopeKey="account-a"
              onChange={onChange}
            />,
          );
        } else if (reason === "scope") {
          rendered.rerender(
            <RecommendationsPresentationControls
              value={undefined}
              isActive
              scopeKey="account-b"
              onChange={onChange}
            />,
          );
        } else {
          rendered.unmount();
        }

        const ownerStopCalls = stop.mock.contexts.filter(
          (context) => context === owner,
        );
        const ownerCancelCalls = cancel.mock.contexts.filter(
          (context) => context === owner,
        );
        expect(ownerStopCalls).toHaveLength(1);
        expect(ownerCancelCalls).toHaveLength(1);
        expect(stopSubscriberCounts).toEqual([1]);
        expect(cancelSubscriberCounts).toEqual([1]);

        act(() => callbacks.end());
        expect(onChange).not.toHaveBeenCalled();
      } finally {
        rendered.unmount();
        start.mockRestore();
        stop.mockRestore();
        cancel.mockRestore();
      }
    },
  );

  it("keeps keyboard lift moves local until drop and announces a distinct terminal drop", async () => {
    const onChange = vi.fn();
    render(
      <RecommendationsPresentationControls value={undefined} onChange={onChange} />,
    );
    const handle = screen.getByRole("button", { name: "Drag Places" });
    const status = screen.getByRole("status");
    const observedAnnouncements: string[] = [];
    const observer = new MutationObserver(() => {
      observedAnnouncements.push(status.textContent || "");
    });
    observer.observe(status, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    handle.focus();

    fireEvent.keyDown(handle, { key: " " });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Lifted Places. Position 1 of 9.",
    );
    expect(handle).toHaveFocus();
    expect(handle).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(handle, { key: "End" });
    expect(onChange).not.toHaveBeenCalled();
    expect(handle).toHaveFocus();
    await waitFor(() =>
      expect(status).toHaveTextContent("Places moved to position 9 of 9."),
    );
    const preview = screen
      .getByRole("region", { name: "Recommendations layout preview" })
      .querySelector('[data-preview-variant="desktop"]');
    expect(
      within(preview as HTMLElement)
        .getAllByTestId("recommendations-preview-category")
        .map((node) => node.getAttribute("data-category-id")),
    ).toEqual([
      "music",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
      "places",
    ]);

    fireEvent.keyDown(handle, { key: "Enter" });
    await waitFor(() =>
      expect(status).toHaveTextContent(
        "Dropped Places at position 9 of 9.",
      ),
    );
    await waitFor(() =>
      expect(observedAnnouncements).toContain(
        "Dropped Places at position 9 of 9.",
      ),
    );
    observer.disconnect();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      layout: "shelves",
      categoryOrder: [
        "music",
        "movies",
        "books",
        "games",
        "guides",
        "apps",
        "products",
        "people",
        "places",
      ],
    });
    expect(observedAnnouncements).toContain(
      "Places moved to position 9 of 9.",
    );
    expect(observedAnnouncements).toContain(
      "Dropped Places at position 9 of 9.",
    );
  });

  it("uses semantic dashboard spacing and elevation while a row is lifted", () => {
    render(
      <RecommendationsPresentationControls value={undefined} onChange={vi.fn()} />,
    );
    const handle = screen.getByRole("button", { name: "Drag Places" });

    fireEvent.keyDown(handle, { key: " " });

    expect(handle.closest("li")).toHaveClass("my-1", "shadow-dashboard-elevated");
  });

  it("restores the row and preview draft when keyboard lift is cancelled", () => {
    const onChange = vi.fn();
    render(
      <RecommendationsPresentationControls value={undefined} onChange={onChange} />,
    );
    const handle = screen.getByRole("button", { name: "Drag Music" });
    handle.focus();

    fireEvent.keyDown(handle, { key: "Enter" });
    fireEvent.keyDown(handle, { key: "Home" });
    fireEvent.keyDown(handle, { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(handle).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cancelled moving Music. Order restored.",
    );
    expect(
      screen
        .getAllByTestId("recommendations-order-category")
        .map((node) => node.getAttribute("data-category-id")),
    ).toEqual(CANONICAL_ORDER);
  });

  it("cancels an uncommitted draft when Appearance becomes inactive", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RecommendationsPresentationControls
        value={undefined}
        isActive
        scopeKey="account-a"
        onChange={onChange}
      />,
    );
    const handle = screen.getByRole("button", { name: "Drag Places" });
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "End" });

    rerender(
      <RecommendationsPresentationControls
        value={undefined}
        isActive={false}
        scopeKey="account-a"
        onChange={onChange}
      />,
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByTestId("recommendations-order-category")
        .map((node) => node.getAttribute("data-category-id")),
    ).toEqual(CANONICAL_ORDER);
  });

  it("normalizes duplicate, unknown, and missing categories before rendering handles", () => {
    render(
      <RecommendationsPresentationControls
        value={{
          layout: "shelves",
          categoryOrder: ["music", "music", "unknown"] as never,
        }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen
        .getAllByTestId("recommendations-order-category")
        .map((node) => node.getAttribute("data-category-id")),
    ).toEqual([
      "music",
      "places",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ]);
    expect(screen.getAllByRole("button", { name: /^Drag / })).toHaveLength(9);
  });

  it("exposes reduced-motion state while retaining semantic reorder rows", () => {
    const { container } = render(
      <MotionConfig reducedMotion="always">
        <RecommendationsPresentationControls value={undefined} onChange={vi.fn()} />
      </MotionConfig>,
    );

    expect(container.querySelector(".appearance-category-list"))
      .toHaveAttribute("data-reduced-motion", "true");
    expect(container.querySelectorAll(".appearance-category-row")).toHaveLength(9);
    expect(INDEX_CSS).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.appearance-category-row[\s\S]*?transition-duration:\s*0\.01ms\s*!important;/,
    );
  });

  it("uses the First view promotion in the illustrative preview", () => {
    render(
      <RecommendationsPresentationControls
        value={{ layout: "featured", categoryOrder: CANONICAL_ORDER }}
        landingTab="music"
        onChange={vi.fn()}
      />,
    );

    const preview = screen.getByRole("region", {
      name: "Recommendations layout preview",
    });
    expect(preview).toHaveAttribute("data-layout", "featured");
    expect(preview).toHaveTextContent(
      "Category choices promote that category but keep all other public categories.",
    );
    const desktopPreview = preview.querySelector(
      '[data-preview-variant="desktop"]',
    );
    expect(desktopPreview).not.toBeNull();
    expect(
      within(desktopPreview as HTMLElement)
        .getAllByTestId("recommendations-preview-category")
        .map((node) => node.getAttribute("data-category-id")),
    ).toEqual([
      "music",
      "places",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ]);
    expect(
      within(desktopPreview as HTMLElement).getByTestId(
        "recommendations-preview-category-promoted",
      ),
    ).toHaveTextContent("Promoted");
  });

  it("renders only the compact effective-order preview while mobile is collapsed", () => {
    render(
      <RecommendationsPresentationControls
        value={{ layout: "grid", categoryOrder: CANONICAL_ORDER }}
        landingTab="music"
        onChange={vi.fn()}
      />,
    );

    const mobilePreview = screen
      .getByRole("region", { name: "Recommendations layout preview" })
      .querySelector('[data-preview-variant="mobile"]');
    expect(mobilePreview).not.toBeNull();
    expect(
      within(mobilePreview as HTMLElement)
        .getAllByTestId("recommendations-preview-summary-category")
        .map((node) => node.getAttribute("data-category-id")),
    ).toEqual(["music", "places", "movies"]);

    const toggle = within(mobilePreview as HTMLElement).getByRole("button", {
      name: "Show full preview",
    });
    expect(
      (mobilePreview as HTMLElement).querySelector(
        "#recommendations-full-preview-mobile",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(mobilePreview as HTMLElement).getAllByRole("button"),
    ).toHaveLength(1);
    expect(toggle).toHaveAttribute(
      "aria-controls",
      "recommendations-mobile-preview-content",
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders only the full effective-order preview while mobile is expanded", () => {
    render(
      <RecommendationsPresentationControls
        value={{ layout: "grid", categoryOrder: CANONICAL_ORDER }}
        landingTab="music"
        onChange={vi.fn()}
      />,
    );

    const mobilePreview = screen
      .getByRole("region", { name: "Recommendations layout preview" })
      .querySelector('[data-preview-variant="mobile"]');
    expect(mobilePreview).not.toBeNull();
    const toggle = within(mobilePreview as HTMLElement).getByRole("button", {
      name: "Show full preview",
    });

    fireEvent.click(toggle);

    const expandedToggle = within(mobilePreview as HTMLElement).getByRole(
      "button",
      { name: "Hide full preview" },
    );
    expect(expandedToggle).toHaveAttribute("aria-expanded", "true");
    expect(
      within(mobilePreview as HTMLElement).queryByTestId(
        "recommendations-preview-summary-category",
      ),
    ).not.toBeInTheDocument();
    const fullPreview = within(mobilePreview as HTMLElement).getByTestId(
      "recommendations-full-preview-mobile",
    );
    expect(fullPreview).toHaveAttribute("data-layout", "grid");
    expect(
      within(fullPreview)
        .getAllByTestId("recommendations-preview-category")
        .map((node) => node.getAttribute("data-category-id")),
    ).toEqual([
      "music",
      "places",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ]);
    expect(within(mobilePreview as HTMLElement).getAllByRole("button"))
      .toHaveLength(1);
  });

  it.each([
    { locale: "ar", resource: arResource },
    { locale: "he", resource: heResource },
  ])(
    "keeps shipped $locale RTL actions logical without a second CSS reversal",
    async ({ locale, resource }) => {
    const rtlI18n = createInstance();
    await rtlI18n.use(initReactI18next).init({
      lng: locale,
      fallbackLng: false,
      resources: {
        [locale]: { translation: resource },
      },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      showSupportNotice: false,
    });
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={rtlI18n}>
        <div className="profile-editor-workspace-shell" dir="rtl">
          <RecommendationsPresentationControls
            value={undefined}
            onChange={onChange}
          />
        </div>
      </I18nextProvider>,
    );

    const recommendationCopy =
      resource.dashboard.profile.themeAppearance.recommendations;
    const dragCopy = resource.dashboard.profile.editor.drag;
    const moviesLabelText = recommendationCopy.categories.movies;
    const interpolateCategory = (template: string) =>
      template.replace("{{category}}", moviesLabelText);
    const moviesLabel = screen.getByText(moviesLabelText, {
      selector: ".appearance-category-label",
    });
    const row = moviesLabel.closest("li");
    const actions = row?.querySelector(".appearance-category-actions");
    expect(moviesLabel).toHaveClass("appearance-category-label");
    expect(actions).toBeInTheDocument();
    const moveUp = within(actions as HTMLElement).getByRole("button", {
      name: interpolateCategory(recommendationCopy.moveUp),
    });
    const moveDown = within(actions as HTMLElement).getByRole("button", {
      name: interpolateCategory(recommendationCopy.moveDown),
    });
    expect(within(actions as HTMLElement).getAllByRole("button")).toEqual([
      moveUp,
      moveDown,
    ]);
    expect(moveUp).toHaveClass("appearance-category-action");
    expect(moveDown).toHaveClass("appearance-category-action");
    const dragHandle = within(row as HTMLElement).getByRole("button", {
      name: interpolateCategory(dragCopy.handle),
    });
    expect(dragHandle).toHaveAccessibleDescription(dragCopy.instructions);

    fireEvent.click(moveUp);

    expect(onChange).toHaveBeenLastCalledWith({
      layout: "shelves",
      categoryOrder: [
        "places",
        "movies",
        "music",
        "books",
        "games",
        "guides",
        "apps",
        "products",
        "people",
      ],
    });
    expect(INDEX_CSS).not.toMatch(
      /\.appearance-category-actions[^{}]*\{[^}]*flex-direction:\s*row-reverse;/s,
    );
    },
  );
});

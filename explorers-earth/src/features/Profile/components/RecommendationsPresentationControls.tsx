import {
  memo,
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Reorder,
  useDragControls,
  useReducedMotionConfig,
} from "framer-motion";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getPreferredRecommendationCategory,
  orderEligibleRecommendationCategoryIds,
  RECOMMENDATION_CATEGORY_METADATA,
} from "../constants/recommendationsPresentation";
import type {
  LandingTabId,
  NormalizedRecommendationsPresentationSettings,
  RecommendationCategoryId,
  RecommendationsLayout,
  RecommendationsPresentationWire,
} from "../types/themeTypes";
import {
  useReorderTransaction,
  type KeyboardMoveTarget,
  type ReorderPhase,
  type ReorderResult,
  type ReorderSessionId,
} from "../hooks/useReorderTransaction";

interface RecommendationsPresentationControlsProps {
  value?: RecommendationsPresentationWire | null;
  landingTab?: LandingTabId | string | null;
  layoutHeading?: ReactNode;
  layoutHeadingId?: string;
  orderHeading?: ReactNode;
  orderHeadingId?: string;
  showStructuralHeadings?: boolean;
  isActive?: boolean;
  scopeKey?: string;
  onChange: (value: NormalizedRecommendationsPresentationSettings) => void;
}

const CATEGORY_FALLBACKS = {
  places: "Places",
  music: "Music",
  movies: "Movies & Shows",
  books: "Books",
  games: "Games",
  guides: "Guides",
  apps: "Apps & Tools",
  products: "Products",
  people: "People",
} as const;

const LAYOUTS: readonly {
  value: RecommendationsLayout;
  label: string;
  description: string;
}[] = [
  {
    value: "shelves",
    label: "Classic Shelves",
    description: "Horizontal shelves with recommendation previews.",
  },
  {
    value: "grid",
    label: "Category Mosaic",
    description: "A compact grid that makes categories easy to scan.",
  },
  {
    value: "featured",
    label: "Featured First",
    description: "A larger first category followed by compact rows.",
  },
];

const fillTemplate = (
  template: string,
  values: Record<string, string | number>,
) =>
  Object.entries(values).reduce(
    (result, [key, value]) =>
      result.split(`{{${key}}}`).join(String(value)),
    template,
  );

interface OwnedDragLifecycle {
  cancel: () => void;
  markCancelled: () => void;
  stop: () => void;
}

interface PointerOwnership {
  cancelled: boolean;
  pointerId: number;
  sessionId: ReorderSessionId;
  started: boolean;
}

interface SortableCategoryRowProps {
  activeCategoryId?: RecommendationCategoryId;
  activeSessionId?: ReorderSessionId;
  announceCancel: (result?: ReorderResult) => void;
  announceDrop: (result?: ReorderResult) => void;
  announceLift: (result?: ReorderResult) => void;
  announceMove: (result?: ReorderResult) => void;
  categoryId: RecommendationCategoryId;
  index: number;
  instructionsId: string;
  isActive: boolean;
  label: string;
  onBeginPointer: (sessionId: ReorderSessionId) => ReorderResult | undefined;
  onCancel: (sessionId: ReorderSessionId) => ReorderResult | undefined;
  onDropKeyboard: (sessionId: ReorderSessionId) => ReorderResult | undefined;
  onFinishPointer: (sessionId: ReorderSessionId) => ReorderResult | undefined;
  onLiftKeyboard: (categoryId: RecommendationCategoryId) => ReorderResult | undefined;
  onMoveFallback: (index: number, delta: -1 | 1) => void;
  onMoveKeyboard: (
    sessionId: ReorderSessionId,
    target: KeyboardMoveTarget,
  ) => ReorderResult | undefined;
  onReleasePointer: (sessionId: ReorderSessionId) => ReorderResult | undefined;
  onReservePointer: (categoryId: RecommendationCategoryId) => ReorderResult | undefined;
  phase: ReorderPhase;
  prefersReducedMotion: boolean;
  registerOwnedSession: (
    sessionId: ReorderSessionId,
    lifecycle: OwnedDragLifecycle,
  ) => void;
  releaseOwnedSession: (sessionId: ReorderSessionId) => void;
  total: number;
}

const SortableCategoryRow = ({
  activeCategoryId,
  activeSessionId,
  announceCancel,
  announceDrop,
  announceLift,
  announceMove,
  categoryId,
  index,
  instructionsId,
  isActive,
  label,
  onBeginPointer,
  onCancel,
  onDropKeyboard,
  onFinishPointer,
  onLiftKeyboard,
  onMoveFallback,
  onMoveKeyboard,
  onReleasePointer,
  onReservePointer,
  phase,
  prefersReducedMotion,
  registerOwnedSession,
  releaseOwnedSession,
  total,
}: SortableCategoryRowProps) => {
  const { t } = useTranslation();
  const dragControls = useDragControls();
  const keyboardSessionIdRef = useRef<ReorderSessionId>();
  const pointerOwnershipsRef = useRef<PointerOwnership[]>([]);
  const hasActiveTransaction =
    phase === "pointer-pending" ||
    phase === "pointer-drag" ||
    phase === "keyboard-lift";
  const isLifted =
    activeCategoryId === categoryId &&
    (phase === "pointer-drag" || phase === "keyboard-lift");

  const markOwnershipCancelled = (sessionId: ReorderSessionId) => {
    const ownership = pointerOwnershipsRef.current.find(
      (candidate) => candidate.sessionId === sessionId,
    );
    if (!ownership) return;
    if (ownership.started) {
      ownership.cancelled = true;
    } else {
      pointerOwnershipsRef.current = pointerOwnershipsRef.current.filter(
        (candidate) => candidate.sessionId !== sessionId,
      );
    }
  };

  const registerControls = (sessionId: ReorderSessionId) => {
    registerOwnedSession(sessionId, {
      cancel: () => dragControls.cancel(),
      markCancelled: () => markOwnershipCancelled(sessionId),
      stop: () => dragControls.stop(),
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      !isActive ||
      hasActiveTransaction ||
      event.button !== 0 ||
      event.isPrimary === false ||
      target.closest(".appearance-category-action") ||
      (event.pointerType === "touch" &&
        !target.closest(".appearance-drag-handle"))
    ) {
      return;
    }
    const reserved = onReservePointer(categoryId);
    if (!reserved) return;
    const ownership: PointerOwnership = {
      cancelled: false,
      pointerId: event.pointerId,
      sessionId: reserved.sessionId,
      started: false,
    };
    pointerOwnershipsRef.current.push(ownership);
    registerControls(reserved.sessionId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragControls.start(event);
  };

  const handlePointerRelease = (event: PointerEvent<HTMLElement>) => {
    const ownership = pointerOwnershipsRef.current.find(
      (candidate) =>
        candidate.pointerId === event.pointerId && !candidate.started,
    );
    if (!ownership) return;
    onReleasePointer(ownership.sessionId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const handlePointerCancel = (event: PointerEvent<HTMLElement>) => {
    const ownership = pointerOwnershipsRef.current.find(
      (candidate) =>
        candidate.pointerId === event.pointerId && !candidate.cancelled,
    );
    if (!ownership) return;
    announceCancel(onCancel(ownership.sessionId));
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const handleTouchCancel = () => {
    const ownership = pointerOwnershipsRef.current.find(
      (candidate) => !candidate.cancelled,
    );
    if (!ownership) return;
    announceCancel(onCancel(ownership.sessionId));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const isKeyboardLifted =
      activeCategoryId === categoryId && phase === "keyboard-lift";

    if (event.key === "Escape" && isLifted) {
      event.preventDefault();
      if (activeSessionId) announceCancel(onCancel(activeSessionId));
      keyboardSessionIdRef.current = undefined;
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (isKeyboardLifted) {
        const sessionId = keyboardSessionIdRef.current;
        if (!sessionId) return;
        const result = onDropKeyboard(sessionId);
        releaseOwnedSession(sessionId);
        keyboardSessionIdRef.current = undefined;
        announceDrop(result);
      } else if (!hasActiveTransaction && isActive) {
        const result = onLiftKeyboard(categoryId);
        if (result) {
          keyboardSessionIdRef.current = result.sessionId;
          registerControls(result.sessionId);
        }
        announceLift(result);
      }
      return;
    }

    if (!isKeyboardLifted) return;
    const moveTarget: KeyboardMoveTarget | undefined =
      event.key === "ArrowUp"
        ? "up"
        : event.key === "ArrowDown"
          ? "down"
          : event.key === "Home"
            ? "start"
            : event.key === "End"
              ? "end"
              : undefined;
    if (!moveTarget) return;
    event.preventDefault();
    const sessionId = keyboardSessionIdRef.current;
    if (sessionId) announceMove(onMoveKeyboard(sessionId, moveTarget));
  };

  return (
    <Reorder.Item
      as="li"
      className={`appearance-category-row ${
        isLifted ? "my-1 shadow-dashboard-elevated" : ""
      }`}
      data-category-id={categoryId}
      data-reorder-active={isLifted ? "true" : "false"}
      data-testid="recommendations-order-category"
      dragControls={dragControls}
      dragListener={false}
      layout="position"
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerRelease}
      onTouchCancel={handleTouchCancel}
      onDragStart={(event) => {
        const pointerId = (event as { pointerId?: number }).pointerId;
        const ownership = pointerOwnershipsRef.current.find(
          (candidate) =>
            candidate.pointerId === pointerId && !candidate.started,
        );
        if (!ownership) return;
        ownership.started = true;
        announceLift(onBeginPointer(ownership.sessionId));
      }}
      onDragEnd={(event) => {
        const pointerId = (event as { pointerId?: number }).pointerId;
        const ownership = pointerOwnershipsRef.current.find(
          (candidate) =>
            candidate.pointerId === pointerId && candidate.started,
        );
        if (!ownership) return;
        pointerOwnershipsRef.current = pointerOwnershipsRef.current.filter(
          (candidate) => candidate !== ownership,
        );
        const result = onFinishPointer(ownership.sessionId);
        releaseOwnedSession(ownership.sessionId);
        announceDrop(result);
      }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { duration: 0.16, ease: [0.4, 0, 0.2, 1] }
      }
      value={categoryId}
    >
      <button
        aria-describedby={instructionsId}
        aria-label={fillTemplate(
          t("dashboard.profile.editor.drag.handle", {
            category: label,
            defaultValue: "Drag {{category}}",
          }),
          { category: label },
        )}
        aria-pressed={isLifted}
        className="appearance-drag-handle rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"
        disabled={!isActive}
        onKeyDown={handleKeyDown}
        style={{ touchAction: "none" }}
        type="button"
      >
        <GripVertical aria-hidden="true" size={20} strokeWidth={1.75} />
      </button>
      <span className="appearance-category-copy">
        <span className="appearance-category-label">{label}</span>
        <span className="block text-xs text-dashboard-light">
          {fillTemplate(
            t("dashboard.profile.themeAppearance.recommendations.position", {
              position: index + 1,
              total,
              defaultValue: "{{position}} of {{total}}",
            }),
            { position: index + 1, total },
          )}
        </span>
      </span>
      <span className="appearance-category-actions">
        <button
          type="button"
          onClick={() => onMoveFallback(index, -1)}
          disabled={!isActive || index === 0}
          aria-label={fillTemplate(
            t("dashboard.profile.themeAppearance.recommendations.moveUp", {
              category: label,
              defaultValue: "Move {{category}} up",
            }),
            { category: label },
          )}
          className="appearance-category-action rounded-md border border-dashboard text-dashboard transition-colors hover:border-dashboard-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          onClick={() => onMoveFallback(index, 1)}
          disabled={!isActive || index === total - 1}
          aria-label={fillTemplate(
            t("dashboard.profile.themeAppearance.recommendations.moveDown", {
              category: label,
              defaultValue: "Move {{category}} down",
            }),
            { category: label },
          )}
          className="appearance-category-action rounded-md border border-dashboard text-dashboard transition-colors hover:border-dashboard-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"
        >
          <span aria-hidden="true">↓</span>
        </button>
      </span>
    </Reorder.Item>
  );
};

export const RecommendationsPresentationControls = memo(
  ({
    value,
    landingTab,
    layoutHeading,
    layoutHeadingId,
    orderHeading,
    orderHeadingId,
    showStructuralHeadings = true,
    isActive = true,
    scopeKey = "recommendations-presentation",
    onChange,
  }: RecommendationsPresentationControlsProps) => {
    const { t } = useTranslation();
    const instructionsId = useId();
    const [announcement, setAnnouncement] = useState("");
    const [isMobilePreviewExpanded, setIsMobilePreviewExpanded] =
      useState(false);
    const ownedDragSessionsRef = useRef(
      new Map<ReorderSessionId, OwnedDragLifecycle>(),
    );
    const cleanupOwnedSession = useCallback((sessionId: ReorderSessionId) => {
      const lifecycle = ownedDragSessionsRef.current.get(sessionId);
      if (!lifecycle) return;
      ownedDragSessionsRef.current.delete(sessionId);
      lifecycle.markCancelled();
      lifecycle.stop();
      lifecycle.cancel();
    }, []);
    const registerOwnedSession = useCallback(
      (sessionId: ReorderSessionId, lifecycle: OwnedDragLifecycle) => {
        ownedDragSessionsRef.current.set(sessionId, lifecycle);
      },
      [],
    );
    const releaseOwnedSession = useCallback((sessionId: ReorderSessionId) => {
      ownedDragSessionsRef.current.delete(sessionId);
    }, []);
    const reorder = useReorderTransaction({
      cleanupSession: cleanupOwnedSession,
      isActive,
      onCommit: onChange,
      scopeKey,
      value,
    });
    const prefersReducedMotion = useReducedMotionConfig();
    const display = reorder.display;
    const preferredCategory = getPreferredRecommendationCategory(landingTab);
    const previewOrder = orderEligibleRecommendationCategoryIds({
      savedOrder: display.categoryOrder,
      eligible: display.categoryOrder,
      preferred: preferredCategory,
    });

    const categoryLabel = (
      metadata: (typeof RECOMMENDATION_CATEGORY_METADATA)[number],
    ) =>
      t(metadata.labelKey, {
        defaultValue: CATEGORY_FALLBACKS[metadata.id],
      });

    const updateLayout = (layout: RecommendationsLayout) => {
      reorder.commitImmediate({
        layout,
        categoryOrder: [...display.categoryOrder],
      });
    };

    const moveCategory = (index: number, delta: -1 | 1) => {
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= display.categoryOrder.length) {
        return;
      }

      const categoryOrder = [...display.categoryOrder];
      const [movedCategory] = categoryOrder.splice(index, 1);
      categoryOrder.splice(targetIndex, 0, movedCategory);
      const metadata = RECOMMENDATION_CATEGORY_METADATA.find(
        ({ id }) => id === movedCategory,
      );
      const label = metadata ? categoryLabel(metadata) : movedCategory;

      const result = reorder.commitImmediate(
        { layout: display.layout, categoryOrder },
        movedCategory,
      );
      if (result?.changed) {
        setAnnouncement(
          fillTemplate(
            t("dashboard.profile.themeAppearance.recommendations.moved", {
              category: label,
              position: targetIndex + 1,
              total: categoryOrder.length,
              defaultValue:
                "{{category}} moved to position {{position}} of {{total}}",
            }),
            {
              category: label,
              position: targetIndex + 1,
              total: categoryOrder.length,
            },
          ),
        );
      }
    };

    const labelForResult = (result?: ReorderResult) => {
      if (!result?.categoryId) return undefined;
      const metadata = RECOMMENDATION_CATEGORY_METADATA.find(
        ({ id }) => id === result.categoryId,
      );
      return metadata ? categoryLabel(metadata) : result.categoryId;
    };

    const announcePosition = (
      key: "lift" | "move" | "drop",
      result?: ReorderResult,
    ) => {
      const category = labelForResult(result);
      if (!category || !result?.position) return;
      const defaults = {
        lift: "Lifted {{category}}. Position {{position}} of {{total}}.",
        move: "{{category}} moved to position {{position}} of {{total}}.",
        drop: "Dropped {{category}} at position {{position}} of {{total}}.",
      } as const;
      setAnnouncement(
        fillTemplate(
          t(`dashboard.profile.editor.drag.${key}`, {
            category,
            position: result.position,
            total: result.total,
            defaultValue: defaults[key],
          }),
          { category, position: result.position, total: result.total },
        ),
      );
    };

    const announceCancel = (result?: ReorderResult) => {
      const category = labelForResult(result);
      if (!category) return;
      setAnnouncement(
        fillTemplate(
          t("dashboard.profile.editor.drag.cancel", {
            category,
            defaultValue: "Cancelled moving {{category}}. Order restored.",
          }),
          { category },
        ),
      );
    };

    const renderPreviewCategories = () =>
      previewOrder.map((id, index) => {
        const metadata = RECOMMENDATION_CATEGORY_METADATA.find(
          (category) => category.id === id,
        );
        if (!metadata) return null;
        const isPromoted = id === preferredCategory;
        return (
          <div
            key={id}
            data-testid="recommendations-preview-category"
            data-category-id={id}
            className={`appearance-preview-category ${
              display.layout === "featured" && index === 0
                ? "appearance-preview-category-featured"
                : ""
            }`}
          >
            {display.layout === "featured" && index === 0 && (
              <span className="appearance-preview-marker text-dashboard-accent">
                {t(
                  "dashboard.profile.themeAppearance.recommendations.featured",
                  "Featured",
                )}
              </span>
            )}
            <span className="appearance-preview-category-label">
              {categoryLabel(metadata)}
            </span>
            {isPromoted && (
              <span
                className="appearance-preview-marker text-dashboard-light"
                data-testid="recommendations-preview-category-promoted"
              >
                {t(
                  "dashboard.profile.editor.appearance.promoted",
                  "Promoted",
                )}
              </span>
            )}
          </div>
        );
      });

    return (
      <div className="appearance-recommendations-controls">
        {showStructuralHeadings && (
          <header className="mb-5">
            <h4
              id="recommendations-presentation-title"
              className="text-sm font-semibold text-dashboard"
            >
              {t(
                "dashboard.profile.themeAppearance.recommendations.title",
                "Recommendations presentation",
              )}
            </h4>
            <p className="mt-1 text-xs leading-5 text-dashboard-light">
              {t(
                "dashboard.profile.themeAppearance.recommendations.help",
                "Choose how recommendation categories are arranged on your public profile.",
              )}
            </p>
          </header>
        )}

        <section
          aria-labelledby={
            showStructuralHeadings
              ? "recommendations-layout-legend"
              : layoutHeadingId
          }
          className="appearance-area"
          data-appearance-area="recommendations-layout"
        >
          {layoutHeading}
          <fieldset
            aria-labelledby={
              showStructuralHeadings ? undefined : layoutHeadingId
            }
          >
            {showStructuralHeadings && (
              <legend
                className="appearance-control-title"
                id="recommendations-layout-legend"
              >
                {t(
                  "dashboard.profile.themeAppearance.recommendations.layoutLegend",
                  "Recommendations layout",
                )}
              </legend>
            )}
            <div className="appearance-layout-options appearance-horizontal-strip">
              {LAYOUTS.map((layout) => {
                const label = t(
                  `dashboard.profile.themeAppearance.recommendations.layouts.${layout.value}.label`,
                  layout.label,
                );
                return (
                  <label
                    key={layout.value}
                    className={`appearance-layout-option min-h-24 cursor-pointer rounded-lg border p-3 transition-colors duration-150 focus-within:ring-2 focus-within:ring-dashboard-accent ${
                      display.layout === layout.value
                        ? "border-dashboard-accent bg-dashboard-accent/10"
                        : "border-dashboard bg-dashboard-muted hover:border-dashboard-accent"
                    }`}
                  >
                    <input
                      type="radio"
                      name="recommendations-layout"
                      value={layout.value}
                      checked={display.layout === layout.value}
                      onChange={() => updateLayout(layout.value)}
                      aria-label={label}
                      className="h-4 w-4 accent-dashboard-accent"
                    />
                    <span className="appearance-layout-option-label text-sm font-semibold text-dashboard">
                      {label}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-dashboard-light">
                      {t(
                        `dashboard.profile.themeAppearance.recommendations.layouts.${layout.value}.description`,
                        layout.description,
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </section>

        <section
          aria-labelledby={
            showStructuralHeadings
              ? "recommendations-order-title"
              : orderHeadingId
          }
          className="appearance-area"
          data-appearance-area="category-order"
        >
          {orderHeading}
          {showStructuralHeadings && (
            <div className="mb-4">
              <h5
                className="text-xs font-semibold text-dashboard"
                id="recommendations-order-title"
              >
                {t(
                  "dashboard.profile.themeAppearance.recommendations.orderTitle",
                  "Category order",
                )}
              </h5>
              <p className="mt-1 text-xs leading-5 text-dashboard-light">
                {t(
                  "dashboard.profile.themeAppearance.recommendations.orderHelp",
                  "Move categories into the order visitors should scan them.",
                )}
              </p>
            </div>
          )}

          <div className="appearance-order-layout">
            <div className="appearance-order-editor">
              <p className="sr-only" id={instructionsId}>
                {t("dashboard.profile.editor.drag.instructions", {
                  defaultValue:
                    "Press Space or Enter to lift. Use Arrow keys or Home and End to move. Press Space or Enter to drop, or Escape to cancel.",
                })}
              </p>
              <Reorder.Group
                as="ol"
                axis="y"
                className="appearance-category-list"
                data-reduced-motion={prefersReducedMotion ? "true" : "false"}
                layoutScroll
                onReorder={(categoryOrder) => {
                  const sessionId =
                    reorder.activePointerSessionIdRef.current;
                  if (!sessionId) return;
                  const result = reorder.updatePointerDraft(
                    sessionId,
                    categoryOrder,
                  );
                  if (result?.changed) announcePosition("move", result);
                }}
                values={display.categoryOrder}
              >
                {display.categoryOrder.map((id, index) => {
                  const metadata = RECOMMENDATION_CATEGORY_METADATA.find(
                    (category) => category.id === id,
                  );
                  if (!metadata) return null;
                  const label = categoryLabel(metadata);
                  return (
                    <SortableCategoryRow
                      activeCategoryId={reorder.activeCategoryId}
                      activeSessionId={reorder.activeSessionId}
                      announceCancel={announceCancel}
                      announceDrop={(result) => announcePosition("drop", result)}
                      announceLift={(result) => announcePosition("lift", result)}
                      announceMove={(result) => {
                        if (result?.changed) announcePosition("move", result);
                      }}
                      categoryId={id}
                      index={index}
                      instructionsId={instructionsId}
                      isActive={isActive}
                      key={id}
                      label={label}
                      onBeginPointer={reorder.beginPointer}
                      onCancel={reorder.cancel}
                      onDropKeyboard={reorder.dropKeyboard}
                      onFinishPointer={reorder.finishPointer}
                      onLiftKeyboard={reorder.liftKeyboard}
                      onMoveFallback={moveCategory}
                      onMoveKeyboard={reorder.moveKeyboard}
                      onReleasePointer={reorder.releasePointer}
                      onReservePointer={reorder.reservePointer}
                      phase={reorder.phase}
                      prefersReducedMotion={Boolean(prefersReducedMotion)}
                      registerOwnedSession={registerOwnedSession}
                      releaseOwnedSession={releaseOwnedSession}
                      total={display.categoryOrder.length}
                    />
                  );
                })}
              </Reorder.Group>
              <div role="status" aria-live="polite" className="sr-only">
                {announcement}
              </div>
            </div>

            <div
              role="region"
              aria-label={t(
                "dashboard.profile.themeAppearance.recommendations.previewLabel",
                "Recommendations layout preview",
              )}
              data-layout={display.layout}
              className="appearance-preview"
            >
              {preferredCategory && (
                <p className="appearance-preview-promotion-note">
                  {t(
                    "dashboard.profile.themeAppearance.firstView.help",
                    "Category choices promote that category but keep all other public categories.",
                  )}
                </p>
              )}
              <p className="appearance-preview-caption">
                {t(
                  "dashboard.profile.themeAppearance.recommendations.previewCaption",
                  "Illustrative preview",
                )}
              </p>

              <div
                className="appearance-preview-mobile"
                data-preview-variant="mobile"
              >
                <div id="recommendations-mobile-preview-content">
                  {isMobilePreviewExpanded ? (
                    <div
                      className="appearance-preview-items"
                      data-layout={display.layout}
                      data-testid="recommendations-full-preview-mobile"
                      id="recommendations-full-preview-mobile"
                    >
                      {renderPreviewCategories()}
                    </div>
                  ) : (
                    <ol className="appearance-preview-summary">
                      {previewOrder.slice(0, 3).map((id) => {
                        const metadata =
                          RECOMMENDATION_CATEGORY_METADATA.find(
                            (category) => category.id === id,
                          );
                        if (!metadata) return null;
                        return (
                          <li
                            key={id}
                            data-category-id={id}
                            data-testid="recommendations-preview-summary-category"
                          >
                            <span className="appearance-preview-category-label">
                              {categoryLabel(metadata)}
                            </span>
                            {id === preferredCategory && (
                              <span className="appearance-preview-marker text-dashboard-light">
                                {t(
                                  "dashboard.profile.editor.appearance.promoted",
                                  "Promoted",
                                )}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
                <button
                  aria-controls="recommendations-mobile-preview-content"
                  aria-expanded={isMobilePreviewExpanded}
                  className="appearance-preview-toggle"
                  onClick={() =>
                    setIsMobilePreviewExpanded((isExpanded) => !isExpanded)
                  }
                  type="button"
                >
                  {isMobilePreviewExpanded
                    ? t(
                        "dashboard.profile.editor.appearance.hideFullPreview",
                        "Hide full preview",
                      )
                    : t(
                        "dashboard.profile.editor.appearance.showFullPreview",
                        "Show full preview",
                      )}
                </button>
              </div>

              <div
                className="appearance-preview-desktop"
                data-preview-variant="desktop"
              >
                <div
                  className="appearance-preview-items"
                  data-layout={display.layout}
                >
                  {renderPreviewCategories()}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  },
);

RecommendationsPresentationControls.displayName =
  "RecommendationsPresentationControls";

export default RecommendationsPresentationControls;

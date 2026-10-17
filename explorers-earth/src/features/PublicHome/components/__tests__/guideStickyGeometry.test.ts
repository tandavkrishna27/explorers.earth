import { afterEach, describe, expect, it } from "vitest";
import * as guideStickyGeometry from "../guideStickyGeometry";

const { measureGuideDayTabsStickyGeometry } = guideStickyGeometry;

const rect = (top: number, height: number): DOMRect => ({
  x: 0,
  y: top,
  top,
  bottom: top + height,
  left: 0,
  right: 320,
  width: 320,
  height,
  toJSON: () => ({}),
});

describe("measureGuideDayTabsStickyGeometry", () => {
  afterEach(() => document.body.replaceChildren());

  it.each([
    { safeTop: 0, physicalHeaderBottom: 56, reservedOffset: 80 },
    { safeTop: 24, physicalHeaderBottom: 80, reservedOffset: 104 },
  ])("uses the semantic reserved offset at safe-top $safeTop for owned-root day activation and placement", ({ physicalHeaderBottom, reservedOffset }) => {
    const header = document.createElement("header");
    const chrome = document.createElement("div");
    chrome.dataset.publicProfileChrome = "";
    const content = document.createElement("div");
    content.dataset.publicContentLayer = "";
    content.style.paddingTop = `${reservedOffset}px`;
    chrome.append(header, content);
    document.body.append(chrome);

    const scrollRoot = document.createElement("div");
    const mainTabs = document.createElement("div");
    const dayTabs = document.createElement("div");
    scrollRoot.append(mainTabs, dayTabs);
    content.append(scrollRoot);

    header.getBoundingClientRect = () => rect(0, physicalHeaderBottom);
    mainTabs.getBoundingClientRect = () => rect(reservedOffset, 120);
    dayTabs.getBoundingClientRect = () => rect(reservedOffset + 120, 40);

    expect(measureGuideDayTabsStickyGeometry(scrollRoot, mainTabs, dayTabs, true)).toEqual({
      shouldStick: true,
      mainTabsHeight: 120,
      reservedOffset,
      stickyTop: reservedOffset + 120,
      placementTop: "calc(var(--public-header-reserved-offset) + 120px)",
    });

    dayTabs.getBoundingClientRect = () => rect(reservedOffset + 121, 40);
    expect(measureGuideDayTabsStickyGeometry(scrollRoot, mainTabs, dayTabs, true).shouldStick).toBe(false);
  });

  it.each([
    { safeTop: 0, physicalHeaderBottom: 56, reservedOffset: 80 },
    { safeTop: 24, physicalHeaderBottom: 80, reservedOffset: 104 },
  ])("uses the semantic reserved offset at safe-top $safeTop for main-tab activation and fixed placement", ({ physicalHeaderBottom, reservedOffset }) => {
    const measureMain = (guideStickyGeometry as unknown as {
      measureGuideMainTabsStickyGeometry?: (
        scrollRoot: HTMLElement,
        mainTabs: HTMLElement,
        coverImage: HTMLElement | null,
      ) => { shouldStick: boolean; reservedOffset: number; placementTop: string };
    }).measureGuideMainTabsStickyGeometry;
    expect(measureMain).toBeTypeOf("function");
    if (!measureMain) return;

    const header = document.createElement("header");
    const chrome = document.createElement("div");
    chrome.dataset.publicProfileChrome = "";
    const content = document.createElement("div");
    content.dataset.publicContentLayer = "";
    content.style.paddingTop = `${reservedOffset}px`;
    const scrollRoot = document.createElement("div");
    const mainTabs = document.createElement("div");
    const coverImage = document.createElement("div");
    scrollRoot.append(coverImage, mainTabs);
    content.append(scrollRoot);
    chrome.append(header, content);
    document.body.append(chrome);

    header.getBoundingClientRect = () => rect(0, physicalHeaderBottom);
    coverImage.getBoundingClientRect = () => rect(0, reservedOffset);
    expect(measureMain(scrollRoot, mainTabs, coverImage)).toEqual({
      shouldStick: true,
      reservedOffset,
      placementTop: "var(--public-header-reserved-offset)",
    });

    coverImage.getBoundingClientRect = () => rect(0, reservedOffset + 1);
    expect(measureMain(scrollRoot, mainTabs, coverImage).shouldStick).toBe(false);
  });

  it("does not activate elements outside the guide-owned overflow root", () => {
    const scrollRoot = document.createElement("div");
    const mainTabs = document.createElement("div");
    const dayTabs = document.createElement("div");
    scrollRoot.append(mainTabs);
    document.body.append(scrollRoot, dayTabs);

    expect(measureGuideDayTabsStickyGeometry(scrollRoot, mainTabs, dayTabs, true).shouldStick).toBe(false);
  });
});

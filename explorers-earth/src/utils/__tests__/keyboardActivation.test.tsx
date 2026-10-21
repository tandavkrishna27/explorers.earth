import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { keyboardActivation } from "../keyboardActivation";

describe("keyboardActivation", () => {
  it("makes a non-interactive banner reachable and operable by keyboard", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <div>
        <div {...keyboardActivation(onOpen)}>Manage Top Picks (0/5)</div>
      </div>,
    );
    await user.tab();
    const banner = screen.getByRole("button", { name: /manage top picks/i });
    expect(banner).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onOpen).toHaveBeenCalledTimes(2);
    await user.click(banner);
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it("ignores keys pressed on a nested control", async () => {
    const user = userEvent.setup();
    const onCard = vi.fn();
    const onInner = vi.fn();
    render(
      <div {...keyboardActivation(onCard)}>
        Card
        <button type="button" onClick={(e) => { e.stopPropagation(); onInner(); }}>Share</button>
      </div>,
    );
    screen.getByRole("button", { name: "Share" }).focus();
    await user.keyboard("{Enter}");
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(onCard).not.toHaveBeenCalled();
  });
});

// Source guard: a click handler on a non-interactive element must also be keyboard operable.
const NON_INTERACTIVE = new Set(["div", "span", "li", "p", "img", "section", "article", "tr", "td", "h1", "h2", "h3", "h4", "h5", "h6", "label"]);
// Deliberate exceptions: pointer-only backdrops / map plumbing / duplicate of a real control.
const ALLOWED = new Set([
  "components/ui/Dropdown.tsx",
  "components/ui/FeedLayout.tsx",
  "features/Books/components/dashboard/AddBookPage.tsx",
  "features/Guides/GuidesPage.tsx",
  "features/PublicHome/components/PublicGuideViews/GuideMapView.tsx",
  // Hero wrappers: the same action is a real <button> inside, so a role here would nest controls.
  "features/AppsAndTools/components/public/AppTopPicksHero.tsx",
  "features/Books/components/public/TopReadsHero.tsx",
  "features/Games/components/public/TopGamesHero.tsx",
  "features/Movies/components/public/TopPicksHero.tsx",
  "features/People/components/public/PersonTopPicksHero.tsx",
  "features/Products/components/public/ProductTopPicksHero.tsx",
]);
const SRC = resolve(__dirname, "../..");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") files(p, out);
    } else if (p.endsWith(".tsx") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

describe("click-only controls (XC-02)", () => {
  it("has no onClick on a non-interactive element without role/tabIndex/keyboard handling", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const attrs = new Map<string, string>();
          let spread = false;
          for (const a of node.attributes.properties) {
            if (ts.isJsxAttribute(a)) attrs.set(a.name.getText(), a.initializer?.getText() ?? "true");
            else if (/keyboardActivation/.test(a.getText())) spread = true;
          }
          const onClick = attrs.get("onClick");
          const stopOnly = onClick && /^\{\s*\(?\s*\w*\s*\)?\s*=>\s*\w*\.stopPropagation\(\)\s*\}$/.test(onClick.replace(/\s+/g, " "));
          if (
            NON_INTERACTIVE.has(node.tagName.getText()) && onClick && !stopOnly && !spread &&
            !attrs.has("role") && !attrs.has("onKeyDown") && !attrs.has("onKeyUp")
          ) {
            offenders.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(offenders).toEqual([]);
  });
});

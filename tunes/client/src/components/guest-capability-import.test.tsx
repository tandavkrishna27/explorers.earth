import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("guest capability handoff UI", () => {
  it("renders an explicit paste/import action without putting the secret in a link", async () => {
    // Break caught: acquisition is prompt-only and normal browser users have no visible import path.
    const componentModule = await import("./guest-capability-import").catch(() => undefined);
    expect(componentModule).toBeDefined();
    if (!componentModule) return;
    const html = renderToStaticMarkup(React.createElement(componentModule.default, {
      guestUrl: "owner-a",
      onImported: () => undefined,
    }));
    expect(html).toContain("Paste guest access handoff");
    expect(html).toContain("Import guest access");
    expect(html).toContain("textarea");
    expect(html).not.toMatch(/href=[^>]*capability/i);
  });
});

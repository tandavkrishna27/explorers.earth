import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import ConfirmationModal from "../ConfirmationModal";
import DialogPanel from "../DialogPanel";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <button type="button">Behind</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <DialogPanel onClose={() => setOpen(false)} className="panel">
            <h2>Archive list?</h2>
            <button type="button">Cancel</button>
            <button type="button">Archive</button>
          </DialogPanel>
        </div>
      )}
    </>
  );
}

describe("DialogPanel (XC-02 hand-built overlays)", () => {
  it("is a labelled modal dialog, traps Tab, closes on Escape and restores focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Archive list?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("falls back to a generic name when the content has no heading", () => {
    render(<DialogPanel onClose={() => {}}><button type="button">x</button></DialogPanel>);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(/dialog/i);
  });
});

describe("ConfirmationModal accessibility (XC-02)", () => {
  it("is a dialog that Escape closes, except while loading", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <ConfirmationModal isOpen onClose={onClose} onConfirm={() => {}} title="Delete section" message="Sure?" isLoading />,
    );
    expect(screen.getByRole("dialog", { name: "Delete section" })).toHaveAttribute("aria-modal", "true");
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    rerender(<ConfirmationModal isOpen onClose={onClose} onConfirm={() => {}} title="Delete section" message="Sure?" />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// Every full-screen overlay must be a dialog (role, focus trap, Escape). New hand-rolled
// `fixed inset-0` overlays fail here until they use Modal / DialogPanel / useDialogA11y.
const SRC = resolve(__dirname, "../../..");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : walk(full);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [full] : [];
  });
}
const DIALOG_MARKERS = /DialogPanel|useDialogA11y|<Modal\b|role="dialog"|role="alertdialog"|PublicBlockingOverlay/;
// Files whose `fixed inset-0` is not a dialog of their own.
const NOT_A_DIALOG: Record<string, string> = {
  "layouts/PublicColdEntryBoundary.tsx": "full-page loading cover",
  "layouts/ResponsiveLayout.tsx": "full-page loading cover",
  "components/EarthLoader/BootSplash.tsx": "boot loading cover (role=status), not interactive",
  "features/PublicHome/components/PublicGuideControlPortal.tsx": "map surface portal, not an overlay dialog",
  "features/PublicHome/components/PublicGuideViews/GuideMapView.tsx": "map surface; place detail is GooglePlaceModal (DialogPanel)",
  "features/PublicHome/components/PublicProfileChromePrimitives.tsx": "decorative wallpaper layers",
  "features/Guides/pages/GuideDetailsPage.tsx": "backdrop host; place detail is GooglePlaceModal (DialogPanel)",
  "features/PublicHome/components/PublicGuideViews/PublicGuideStayView.tsx": "backdrop host; place detail is GooglePlaceModal (DialogPanel)",
  "features/PublicHome/components/PublicGuideViews/DayNavigationView.tsx": "backdrop host; place detail is PlaceOverview (DialogPanel)",
  "features/Favorites/components/Recommendations.tsx": "backdrop host; place detail is PlaceOverview (DialogPanel)",
  "features/PublicHome/components/PublicHome.tsx": "backdrop host; place detail is PlaceOverview (DialogPanel)",
  "features/Guides/GuidesPage.tsx": "mobile filter drawer is always mounted and hidden with visibility, see follow-up",
};

describe("full-screen overlays are dialogs (XC-02 audit)", () => {
  const offenders = walk(SRC)
    .map((file) => ({ rel: relative(SRC, file).split("\\").join("/"), text: readFileSync(file, "utf8") }))
    .filter(({ text }) => /fixed inset-0/.test(text))
    .filter(({ rel, text }) => !NOT_A_DIALOG[rel] && !DIALOG_MARKERS.test(text))
    .map(({ rel }) => rel);

  it("has no hand-rolled fixed inset-0 overlay without dialog semantics", () => {
    expect(offenders).toEqual([]);
  });

  it("keeps the place detail overlays on DialogPanel", () => {
    for (const rel of [
      "features/PublicHome/components/PlaceDetails/PlaceOverview.tsx",
      "features/PublicHome/components/PublicGuideViews/GooglePlaceModal.tsx",
    ]) {
      expect(readFileSync(join(SRC, rel), "utf8")).toContain("<DialogPanel");
    }
  });
});

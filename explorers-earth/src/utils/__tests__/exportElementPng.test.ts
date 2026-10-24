import { describe, expect, it, vi } from "vitest";
const toPng = vi.hoisted(() => vi.fn().mockResolvedValue("data:image/png;base64,AA"));
vi.mock("html-to-image", () => ({ toPng }));
import { exportElementPng, savePng } from "../exportElementPng";

function sized(width: number, height: number) {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetWidth", { value: width });
  Object.defineProperty(el, "offsetHeight", { value: height });
  return el;
}

describe("exportElementPng", () => {
  it("captures the element at its own layout size, no transform override, pixelRatio 2", async () => {
    await exportElementPng(sized(320, 420), { backgroundColor: "#000000" });
    const options = toPng.mock.calls[0][1];
    expect(options).toMatchObject({ width: 320, height: 420, pixelRatio: 2, cacheBust: true, backgroundColor: "#000000" });
    expect(options.style).toBeUndefined();
  });

  it("ignores ancestor scale: uses offset size, not the scaled bounding box", async () => {
    const el = sized(320, 420);
    el.getBoundingClientRect = () => ({ width: 160, height: 210 }) as DOMRect;
    await exportElementPng(el);
    expect(toPng.mock.calls.at(-1)?.[1]).toMatchObject({ width: 320, height: 420 });
    expect(toPng.mock.calls.at(-1)?.[1]).not.toHaveProperty("backgroundColor");
  });

  it("refuses a zero-size or missing element instead of saving an empty image", async () => {
    await expect(exportElementPng(document.createElement("div"))).rejects.toThrow("QR card is not visible");
    await expect(exportElementPng(null)).rejects.toThrow("QR card is not visible");
  });

  it("savePng clicks a download link with the file name", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    savePng("data:image/png;base64,AA", "x.png");
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("x.png");
    expect(anchor.href).toBe("data:image/png;base64,AA");
    click.mockRestore();
  });
});

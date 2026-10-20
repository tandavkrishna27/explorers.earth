import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadQrSvgAsPng, MIN_QR_DOWNLOAD_SIZE, qrDownloadScale } from "../qrDownload";

describe("qrDownloadScale", () => {
  it("brings small QR codes up to the minimum size and leaves large ones alone", () => {
    expect((90 + 40) * qrDownloadScale(90, 20)).toBeGreaterThanOrEqual(MIN_QR_DOWNLOAD_SIZE);
    expect(qrDownloadScale(90)).toBe(6);
    expect(qrDownloadScale(600)).toBe(1);
    expect(qrDownloadScale(0)).toBe(1);
  });
});

describe("downloadQrSvgAsPng", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("writes a PNG of at least 512 by 512 for a 90px QR", () => {
    document.body.innerHTML = '<svg id="qr" width="90" height="90"></svg>';
    const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "", imageSmoothingEnabled: true };
    const sizes: number[][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push([this.width, this.height]);
      return "data:image/png;base64,";
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    class FakeImage {
      width = 90;
      height = 90;
      onload: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    expect(downloadQrSvgAsPng("qr", "qr.png", 20)).toBe(true);
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(sizes).toHaveLength(1);
        expect(sizes[0][0]).toBeGreaterThanOrEqual(MIN_QR_DOWNLOAD_SIZE);
        expect(sizes[0][1]).toBeGreaterThanOrEqual(MIN_QR_DOWNLOAD_SIZE);
        expect(ctx.imageSmoothingEnabled).toBe(false);
        resolve();
      }, 0),
    );
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../getCurrentDomain", () => ({ getBaseUrl: () => "https://runtime.example" }));

import { buildListPublicUrl, buildQrUrl } from "../listShareUrls";
import { downloadQrSvgAsPng } from "../qrDownload";

describe("list share urls", () => {
  it("builds the public list URL from the runtime origin, resolved at call time", () => {
    expect(buildListPublicUrl("ana", "apps", "my-list")).toBe("https://runtime.example/ana/apps/my-list");
  });

  it("tags the QR URL as QR Code traffic and leaves the plain URL untagged", () => {
    const plain = buildListPublicUrl("ana", "movies", "m");
    expect(plain).not.toContain("utm_");
    const qr = new URL(buildQrUrl(plain));
    expect(qr.searchParams.get("utm_source")).toBe("qr_code_scan");
    expect(qr.searchParams.get("utm_medium")).toBe("qr_code");
  });

  it("replaces share tags on a QR url instead of keeping them", () => {
    const qr = new URL(buildQrUrl("https://runtime.example/ana?utm_source=direct&utm_medium=share"));
    expect(qr.searchParams.getAll("utm_source")).toEqual(["qr_code_scan"]);
    expect(qr.searchParams.get("utm_medium")).toBe("qr_code");
  });
});

describe("downloadQrSvgAsPng", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("serialises only the svg with the given id, never another svg in the page", () => {
    document.body.innerHTML =
      '<svg id="logo"><title>sidebar logo</title></svg><svg id="list-qr-apps"><title>the qr</title></svg>';
    const serialize = vi.spyOn(XMLSerializer.prototype, "serializeToString");
    expect(downloadQrSvgAsPng("list-qr-apps", "x.png")).toBe(true);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect((serialize.mock.calls[0][0] as Element).id).toBe("list-qr-apps");
    serialize.mockRestore();
  });

  it("does nothing when the id is missing or not an svg", () => {
    document.body.innerHTML = '<svg id="logo"></svg><div id="list-qr-apps"></div>';
    expect(downloadQrSvgAsPng("nope", "x.png")).toBe(false);
    expect(downloadQrSvgAsPng("list-qr-apps", "x.png")).toBe(false);
  });
});

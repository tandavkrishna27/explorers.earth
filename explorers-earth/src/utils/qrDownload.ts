/** The smallest side, in pixels, of a downloaded QR image. A 90px on-screen QR is not scannable once printed. */
export const MIN_QR_DOWNLOAD_SIZE = 512;

/**
 * Pixel size of the downloaded image for a QR drawn `size` pixels wide with `padding` on
 * each side: the whole-number scale that brings the image to at least MIN_QR_DOWNLOAD_SIZE.
 */
export function qrDownloadScale(size: number, padding = 0): number {
  const side = size + padding * 2;
  return side > 0 ? Math.max(1, Math.ceil(MIN_QR_DOWNLOAD_SIZE / side)) : 1;
}

/**
 * Download a rendered QR <svg> as a PNG. Targets the element by id so it can never pick up an
 * unrelated <svg> (e.g. the sidebar logo) elsewhere in the document. The SVG is drawn at a
 * whole-number multiple of its on-screen size so the file is at least MIN_QR_DOWNLOAD_SIZE
 * square, with crisp module edges.
 */
export function downloadQrSvgAsPng(svgId: string, fileName: string, padding = 0): boolean {
  const svg = document.getElementById(svgId);
  if (!svg || svg.tagName.toLowerCase() !== "svg") return false;
  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    const scale = qrDownloadScale(img.width, padding);
    const pad = padding * scale;
    canvas.width = img.width * scale + pad * 2;
    canvas.height = img.height * scale + pad * 2;
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      if (pad) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, pad, pad, img.width * scale, img.height * scale);
    }
    const a = document.createElement("a");
    a.download = fileName;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  return true;
}

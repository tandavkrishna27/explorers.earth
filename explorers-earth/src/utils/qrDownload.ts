/**
 * Download a rendered QR <svg> as a PNG. Targets the element by id so it can never pick up an
 * unrelated <svg> (e.g. the sidebar logo) elsewhere in the document.
 */
export function downloadQrSvgAsPng(svgId: string, fileName: string, padding = 0): boolean {
  const svg = document.getElementById(svgId);
  if (!svg || svg.tagName.toLowerCase() !== "svg") return false;
  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width + padding * 2;
    canvas.height = img.height + padding * 2;
    if (padding && ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx?.drawImage(img, padding, padding);
    const a = document.createElement("a");
    a.download = fileName;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  return true;
}

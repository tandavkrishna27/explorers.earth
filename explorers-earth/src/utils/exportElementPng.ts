// QR cards render inside scaled modals and phones; capturing at the element's own layout
// size (offset*, unaffected by ancestor transforms) keeps the PNG complete (OWN-07).
export async function exportElementPng(
  element: HTMLElement | null,
  options: { backgroundColor?: string } = {},
): Promise<string> {
  if (!element || !element.offsetWidth || !element.offsetHeight) throw new Error("QR card is not visible");
  const { toPng } = await import("html-to-image");
  return toPng(element, {
    cacheBust: true,
    width: element.offsetWidth,
    height: element.offsetHeight,
    pixelRatio: 2,
    ...(options.backgroundColor ? { backgroundColor: options.backgroundColor } : {}),
  });
}

export function savePng(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

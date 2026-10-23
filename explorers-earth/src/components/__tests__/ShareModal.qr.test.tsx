import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const exportElementPng = vi.hoisted(() => vi.fn().mockResolvedValue("data:image/png;base64,AA"));
const savePng = vi.hoisted(() => vi.fn());
vi.mock("../../utils/exportElementPng", () => ({ exportElementPng, savePng }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }) }));
import ShareModal from "../ShareModal";

it("downloads the QR through the sized export", async () => {
  render(<ShareModal isOpen onClose={vi.fn()} url="https://explorers.earth/u/movies/x" shareButtons={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "QR" }));
  fireEvent.click(screen.getByRole("button", { name: /download/i }));
  await waitFor(() =>
    expect(exportElementPng).toHaveBeenCalledWith(document.getElementById("qr-sticker-container"), { backgroundColor: "#000000" }),
  );
  expect(savePng).toHaveBeenCalledWith("data:image/png;base64,AA", "explorers-qr-sticker.png");
});

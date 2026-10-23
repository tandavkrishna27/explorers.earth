import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }) }));
const exportElementPng = vi.hoisted(() => vi.fn().mockResolvedValue("data:image/png;base64,AA"));
const savePng = vi.hoisted(() => vi.fn());
vi.mock("../../../../utils/exportElementPng", () => ({ exportElementPng, savePng }));
import ShareTab from "../ShareTab";
import { adapterFixture } from "./adapterFixture";

describe("ShareTab", () => {
  it("copies the public link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareTab adapter={adapterFixture({ status: "public" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://explorers.earth/smoketest1021/movies/comfort-movies"));
  });

  it("downloads the QR card at full size", async () => {
    render(<ShareTab adapter={adapterFixture({ status: "public" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Download QR" }));
    await waitFor(() => expect(exportElementPng).toHaveBeenCalledWith(screen.getByTestId("list-qr-card"), {}));
    await waitFor(() => expect(savePng).toHaveBeenCalledWith("data:image/png;base64,AA", "comfort-movies-qr.png"));
  });

  it("a draft list explains that the link works after publishing", () => {
    render(<ShareTab adapter={adapterFixture({ status: "draft" })} />);
    expect(screen.getByText("Publish this list to share it. Only you can see drafts.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download QR" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
  });

  it("shows Private as coming soon (LP-10)", () => {
    render(<ShareTab adapter={adapterFixture({ status: "public" })} />);
    expect(screen.getByText(/Private sharing — coming soon/)).toBeInTheDocument();
  });

  it("renders nothing without a list", () => {
    const { container } = render(<ShareTab adapter={adapterFixture({ list: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

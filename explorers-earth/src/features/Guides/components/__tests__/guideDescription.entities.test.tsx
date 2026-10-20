import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GuideHeader from "../GuideDetails/GuideHeader";
import TopPicksHero from "../TopPicksHero";
import DescriptionRenderer from "../Shared/DescriptionRenderer";

Element.prototype.scrollIntoView = vi.fn();

vi.mock("../../context/GuideEditingProvider", () => ({ useGuideEditing: () => ({ setPublished: vi.fn() }) }));

const guide = {
  documentId: "g1",
  Title: "Kyoto",
  Description: "Temples&nbsp;and tea &amp; more",
  Visibility: true,
  Guide_Media: [],
  Number_Of_Days: 3,
} as never;

describe("guide descriptions render as plain text", () => {
  it("owner header decodes entities", () => {
    render(<MemoryRouter><GuideHeader guide={guide} guideId="g1" /></MemoryRouter>);
    expect(document.body.textContent).not.toContain("&nbsp;");
    expect(document.body.textContent).toContain("Temples and tea & more");
  });

  it("featured hero decodes entities", () => {
    render(<MemoryRouter><TopPicksHero guides={[guide]} onGuideClick={() => undefined} /></MemoryRouter>);
    expect(document.body.textContent).not.toContain("&nbsp;");
    expect(document.body.textContent).toContain("Temples and tea & more");
  });

  it("section renderer decodes entities in strings and rich blocks", () => {
    render(<DescriptionRenderer description={[{ type: "paragraph", children: [{ text: "A&nbsp;B" }] }]} />);
    expect(screen.getByText("A B")).toBeInTheDocument();
  });
});

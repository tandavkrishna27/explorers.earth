import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

// Decision D9. The category picker read a Strapi `guideCategories` collection. The canonical
// contract stores free strings (`guide_collection_details.categories`), so that collection
// was a suggestion list, never data integrity - but the field is required with "select at
// least 4", and an empty list used to render "No categories available" with no way forward.
//
// These cases exist because that is the difference between guide creation degrading and
// guide creation being impossible, and because a first guide has no history to suggest from.

const history: string[][] = [];

vi.mock("../../hooks/useGuidesOwner", () => ({
  useGuidesOwner: () => ({
    guides: history.map((Category, index) => ({ documentId: `guide-${index}`, Category })),
    loading: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import CreateGuideStep2 from "../CreateGuideStep2";

function renderStep(used: string[][] = []) {
  history.length = 0;
  history.push(...used);
  return render(<CreateGuideStep2 onBack={() => {}} onNext={() => {}} />);
}

/** Type into the category box and open its menu. */
function search(value: string) {
  const input = screen.getByPlaceholderText(/categories\.\.\./i);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

// The case that matters most: a creator with no guides yet must still be able to satisfy a
// required field that asks for four categories.
it("lets a first guide name categories that do not exist yet", () => {
  renderStep();
  expect(screen.queryByText(/no categories available/i)).not.toBeInTheDocument();

  for (const name of ["Food", "Trekking", "Budget", "Family"]) {
    search(name);
    fireEvent.click(screen.getByRole("button", { name: `Add “${name}”` }));
  }

  for (const name of ["Food", "Trekking", "Budget", "Family"])
    expect(screen.getByRole("button", { name: `Remove ${name}` })).toBeInTheDocument();
  expect(screen.getByText(/4 categories selected/i)).toBeInTheDocument();
  expect(screen.queryByText(/minimum 4 required/i)).not.toBeInTheDocument();
});

it("suggests every distinct category this creator has used, sorted and deduplicated", () => {
  renderStep([["Trekking", "Food"], ["Food", "Budget"], []]);
  search("");

  for (const name of ["Budget", "Food", "Trekking"])
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  // Deduplicated: "Food" appears in two guides and is offered once.
  expect(screen.getAllByRole("button", { name: "Food" })).toHaveLength(1);
});

it("does not offer to add a category already suggested or already selected", () => {
  renderStep([["Trekking"]]);

  search("Trekking");
  expect(screen.queryByRole("button", { name: "Add “Trekking”" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Trekking" }));

  search("Trekking");
  expect(screen.queryByRole("button", { name: "Add “Trekking”" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove Trekking" })).toBeInTheDocument();
});

it("ignores blank and non-string history instead of offering empty suggestions", () => {
  renderStep([["  ", "", null as unknown as string, 7 as unknown as string, "Food", " Trekking "]]);
  search("");

  expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
  // Trimmed, so a padded history entry does not become a distinct category.
  expect(screen.getByRole("button", { name: "Trekking" })).toBeInTheDocument();
});

it("does not add whitespace as a category", () => {
  renderStep();
  search("   ");
  expect(screen.queryByRole("button", { name: /^Add /i })).not.toBeInTheDocument();
});

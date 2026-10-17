import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import UpArrow from "../UpArrow";

it("renders without React invalid SVG attribute warnings", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    render(<UpArrow />);

    const invalidSvgWarnings = consoleError.mock.calls.filter((call) =>
      call.some(
        (argument) =>
          typeof argument === "string" &&
          (argument.includes("Invalid DOM property") ||
            argument.includes("Invalid DOM attribute")),
      ),
    );

    expect(invalidSvgWarnings).toEqual([]);
  } finally {
    consoleError.mockRestore();
  }
});

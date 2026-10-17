import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import TiptapEditor from "../TiptapEditor";

const { renderedQuillProps } = vi.hoisted(() => ({
  renderedQuillProps: { current: undefined as unknown },
}));

vi.mock("react-quill-new", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    default: React.forwardRef((props: Record<string, unknown>) => {
      renderedQuillProps.current = props;
      return React.createElement("div", { "data-testid": "quill-editor" });
    }),
  };
});

vi.mock("quill2-emoji", () => ({}));

interface QuillBoundaryProps {
  formats: string[];
  modules: {
    toolbar: Array<Array<string | Record<string, unknown>>>;
  };
}

it("uses the Quill 2 format whitelist while keeping ordered and bullet list controls", () => {
  render(<TiptapEditor value="" onChange={vi.fn()} />);

  const config = renderedQuillProps.current as QuillBoundaryProps;
  expect(config.formats).toEqual([
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "list",
    "emoji",
  ]);
  expect(config.modules.toolbar).toContainEqual([
    { list: "ordered" },
    { list: "bullet" },
  ]);
});

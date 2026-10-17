import { decode } from "html-entities";

function richTextLeafText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

function richTextBlockText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const children = (value as { children?: unknown }).children;
  return Array.isArray(children) ? children.map(richTextLeafText).join(" ") : "";
}

export function guideDescriptionText(description: unknown): string {
  const extracted = typeof description === "string"
    ? description
    : Array.isArray(description)
      ? description.map(richTextBlockText).join(" ")
      : "";

  return decode(extracted, { level: "html5", scope: "strict" }).replace(/\u00a0/g, " ");
}

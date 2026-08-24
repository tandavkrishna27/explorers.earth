import DOMPurify from "dompurify";

const PUBLIC_RICH_TEXT_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "span",
] as const;

const PUBLIC_RICH_TEXT_ATTRIBUTES = [
  "href",
  "target",
  "rel",
  "class",
  "style",
  "data-list",
] as const;
const SAFE_QUILL_CLASSES = new Set([
  "ql-ui",
  "ql-color-white",
  "ql-color-red",
  "ql-color-orange",
  "ql-color-yellow",
  "ql-color-green",
  "ql-color-blue",
  "ql-color-purple",
  "ql-bg-black",
  "ql-bg-red",
  "ql-bg-orange",
  "ql-bg-yellow",
  "ql-bg-green",
  "ql-bg-blue",
  "ql-bg-purple",
]);
const SAFE_QUILL_LIST_TYPES = new Set(["ordered", "bullet"]);
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });

const isSafeQuillColor = (value: string) => {
  if (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)) return true;

  const functionalColor = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!functionalColor) return false;

  const parts = functionalColor[1].split(",").map((part) => part.trim());
  const expectedLength = value.toLowerCase().startsWith("rgba") ? 4 : 3;
  if (parts.length !== expectedLength) return false;

  const channels = parts.slice(0, 3).map(Number);
  if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    return false;
  }

  if (expectedLength === 4) {
    const alpha = Number(parts[3]);
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return false;
  }

  return true;
};

const retainSafeQuillFormatting = (template: HTMLTemplateElement) => {
  template.content.querySelectorAll<HTMLElement>("[class]").forEach((element) => {
    const safeClasses = element.tagName === "SPAN"
      ? Array.from(element.classList).filter((className) => SAFE_QUILL_CLASSES.has(className))
      : [];

    if (safeClasses.length) {
      element.className = safeClasses.join(" ");
    } else {
      element.removeAttribute("class");
    }
  });

  template.content.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const parsedStyle = document.createElement("span");
    parsedStyle.setAttribute("style", element.getAttribute("style") ?? "");
    const color = parsedStyle.style.getPropertyValue("color").trim();
    const backgroundColor = parsedStyle.style.getPropertyValue("background-color").trim();

    element.removeAttribute("style");
    if (element.tagName !== "SPAN") return;

    if (isSafeQuillColor(color)) element.style.color = color;
    if (isSafeQuillColor(backgroundColor)) {
      element.style.backgroundColor = backgroundColor;
    }

    if (!element.getAttribute("style")) element.removeAttribute("style");
  });

  template.content.querySelectorAll<HTMLElement>("[data-list]").forEach((element) => {
    const listType = element.getAttribute("data-list") ?? "";
    if (element.tagName !== "LI" || !SAFE_QUILL_LIST_TYPES.has(listType)) {
      element.removeAttribute("data-list");
    }
  });

  template.content.querySelectorAll<HTMLUListElement | HTMLOListElement>("ol, ul").forEach((list) => {
    const items = Array.from(list.children);
    if (
      !items.length ||
      items.some((item) => item.tagName !== "LI") ||
      !items.some((item) => item.hasAttribute("data-list"))
    ) {
      return;
    }

    const normalizedLists = document.createDocumentFragment();
    let currentList: HTMLUListElement | HTMLOListElement | null = null;

    items.forEach((item) => {
      const listType = item.getAttribute("data-list");
      const tagName = listType === "bullet"
        ? "UL"
        : listType === "ordered"
          ? "OL"
          : list.tagName;
      if (!currentList || currentList.tagName !== tagName) {
        currentList = document.createElement(tagName.toLowerCase()) as
          | HTMLUListElement
          | HTMLOListElement;
        normalizedLists.append(currentList);
      }
      currentList.append(item);
    });

    list.replaceWith(normalizedLists);
  });
};

export function normalizePublicWebHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;

  const value = raw.trim();
  if (!value || hasControlCharacters(value) || /%0[ad]/i.test(value)) {
    return undefined;
  }

  const candidate = value.startsWith("//")
    ? `https:${value}`
    : /^[a-z][a-z\d+.-]*:/i.test(value)
      ? value
      : `https://${value}`;

  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return candidate;
}

export function normalizePublicEmailHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;

  const value = raw.trim();
  if (!value || hasControlCharacters(value) || /%0[ad]/i.test(value)) {
    return undefined;
  }

  if (/^mailto:/i.test(value)) {
    const address = value.slice(value.indexOf(":") + 1).split("?", 1)[0];
    return EMAIL_ADDRESS_PATTERN.test(address) ? value : undefined;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value) || !EMAIL_ADDRESS_PATTERN.test(value)) {
    return undefined;
  }

  return `mailto:${value}`;
}

export function sanitizePublicRichText(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";

  const sanitized = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [...PUBLIC_RICH_TEXT_TAGS],
    ALLOWED_ATTR: [...PUBLIC_RICH_TEXT_ATTRIBUTES],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });

  const template = document.createElement("template");
  template.innerHTML = sanitized;
  retainSafeQuillFormatting(template);

  template.content.querySelectorAll("a").forEach((anchor) => {
    const rawHref = anchor.getAttribute("href");
    const safeHref = rawHref?.toLowerCase().startsWith("mailto:")
      ? normalizePublicEmailHref(rawHref)
      : normalizePublicWebHref(rawHref);

    if (!safeHref) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      return;
    }

    anchor.setAttribute("href", safeHref);
    if (safeHref.toLowerCase().startsWith("mailto:")) {
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      return;
    }

    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  });

  return template.innerHTML;
}

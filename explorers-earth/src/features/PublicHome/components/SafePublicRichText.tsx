import type { ComponentPropsWithoutRef } from "react";
import { sanitizePublicRichText } from "../utils/publicProfileContent";

type SafePublicRichTextProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "dangerouslySetInnerHTML"
> & {
  html: unknown;
};

/** Shared render boundary for public recommendation rich text. */
const SafePublicRichText = ({ html, ...props }: SafePublicRichTextProps) => (
  <div
    {...props}
    dangerouslySetInnerHTML={{ __html: sanitizePublicRichText(html) }}
  />
);

export default SafePublicRichText;

import { ComponentType, lazy } from "react";

/**
 * React.lazy for a named export of a barrel module, e.g.
 * `lazyNamed(() => import("../features/Guides"), "GuidesPage")`.
 * Each route group becomes its own chunk instead of being bundled into the entry.
 */
export function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(
  load: () => Promise<M>,
  key: K,
) {
  return lazy(async () => ({ default: (await load())[key] as ComponentType<any> }));
}

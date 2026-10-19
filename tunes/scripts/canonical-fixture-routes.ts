import type { Express } from 'express';
import { canonicalNotFoundHandler } from '../server/middleware/canonicalTerminator';

/**
 * Browser fixtures add their own control and observer routes after createCanonicalApp has
 * installed the canonical terminator, whose 404 handler answers every unmatched path - so a
 * route registered after it is unreachable. Register through `register`, then move every
 * layer it added in front of the terminator.
 */
export function registerBeforeCanonicalTerminator(app: Express, register: () => void): void {
  const stack = (app as unknown as { router: { stack: { handle: unknown }[] } }).router.stack;
  const before = stack.length;
  register();
  const added = stack.splice(before);
  const terminator = stack.findIndex((layer) => layer.handle === canonicalNotFoundHandler);
  if (terminator < 0) throw new Error('Canonical terminator layer not found');
  stack.splice(terminator, 0, ...added);
}

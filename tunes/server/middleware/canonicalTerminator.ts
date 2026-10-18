import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;

function normalizePeerAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const unwrapped = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return unwrapped.toLowerCase().startsWith("::ffff:") ? unwrapped.slice(7) : unwrapped;
}

/**
 * Canonical replacement for `musicIdentityConfig.isTrustedProxy`
 * (config/music-identity-config.ts:152). The normalization is identical —
 * trim, unbracket, strip an IPv4-mapped prefix.
 *
 * Two DELIBERATE differences from the Music original: it has no live/fixture
 * mode, and an unset variable yields `false` (trust nobody) instead of throwing.
 * Throwing at construction would make every unit test that builds the canonical
 * app require the variable. Trusting nobody is the safe default — the only cost
 * is that request.ip reports the proxy's address until the variable is set.
 *
 * A set-but-invalid value still throws: that is a misconfiguration, not a default.
 * `trust proxy: true` is never produced, because it would make X-Forwarded-For
 * attacker-controlled.
 *
 * MUSIC_TRUSTED_PROXY_IP stays accepted so the running compose file keeps working
 * through the cutover; drop it when that variable is renamed.
 */
export function resolveTrustedProxy(environment: Environment): ((peer: string) => boolean) | false {
  const configured = normalizePeerAddress(
    environment.EXPLORERS_TRUSTED_PROXY_IP ?? environment.MUSIC_TRUSTED_PROXY_IP,
  );
  if (configured === undefined) return false;
  if (isIP(configured) === 0) throw new Error("EXPLORERS_TRUSTED_PROXY_IP must be one exact IP address");
  return (peer: string) => normalizePeerAddress(peer) === configured;
}

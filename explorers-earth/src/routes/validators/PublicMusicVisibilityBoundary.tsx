import type { ReactNode } from "react";

/**
 * Music visibility is resolved by the account-keyed availability provider.
 * Unlike category guards, this boundary deliberately preserves an explicit
 * friendly URL so ProfileMusic can render Retry and Return to Profile.
 */
export default function PublicMusicVisibilityBoundary({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

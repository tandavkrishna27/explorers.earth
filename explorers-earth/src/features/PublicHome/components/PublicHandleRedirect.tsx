import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { usePublicAccountShell } from "../api/PublicAccountIdentityProvider";

/** The same page under a different handle: only the first path segment changes. */
export function withHandle(pathname: string, handle: string): string {
  const [, ...rest] = pathname.split("/").filter(Boolean);
  return `/${[encodeURIComponent(handle), ...rest].join("/")}`;
}

/**
 * A handle an account recently left is held and answered by the server with a redirect to
 * the account's current handle, so the shell read for `/old/...` comes back as the profile
 * of `new`. Everything below the identity provider treats a profile under a different
 * handle as not found, which is right for a stranger's handle and wrong for this one, so a
 * moved handle is followed to the same page under the new handle instead.
 */
export default function PublicHandleRedirect({ children }: { children: ReactNode }) {
  const { username } = useParams();
  const shell = usePublicAccountShell();
  const location = useLocation();
  const navigate = useNavigate();
  const requested = (username ?? "").trim().toLowerCase();
  const current = typeof shell?.data?.username === "string" ? shell.data.username : undefined;
  const movedTo = shell && !shell.loading && requested && current && current.trim().toLowerCase() !== requested ? current : undefined;
  useEffect(() => {
    if (movedTo) navigate({ pathname: withHandle(location.pathname, movedTo), search: location.search, hash: location.hash }, { replace: true });
  }, [movedTo, location.pathname, location.search, location.hash, navigate]);
  return movedTo ? null : <>{children}</>;
}

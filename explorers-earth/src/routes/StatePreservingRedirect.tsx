import { Navigate, useLocation } from "react-router-dom";

/**
 * A redirect that carries the caller's navigation state across a legacy-path hop.
 *
 * A plain `<Navigate to=... />` drops `location.state`, so
 * `navigate("/music", { state: { justCreatedList: true } })` would lose the flag
 * before the target page mounts — and downstream logic (e.g. the Music page's
 * "make this list public?" prompt) never fires. Used for the legacy /guides,
 * /music and /hub redirects.
 */
const StatePreservingRedirect = ({ to }: { to: string }) => {
  const location = useLocation();
  return <Navigate to={to} state={location.state} replace />;
};

export default StatePreservingRedirect;

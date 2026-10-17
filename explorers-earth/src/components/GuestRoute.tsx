import { Navigate, Outlet } from "react-router-dom";
import useAuthStore from "../store/store";
import { EarthLoader } from "./EarthLoader";
import { useSessionBootstrap } from "../lib/sessionBootstrap";

/**
 * GuestRoute — only accessible to unauthenticated users.
 * If a user is already logged in they are silently redirected to /home.
 */
const GuestRoute = () => {
    const { status, isAuthenticated } = useAuthStore();
    // GuestRoute wraps "/" and "/login", neither of which is inside ProtectedRoute, so
    // without its own bootstrap both would render a loader forever.
    useSessionBootstrap();

    if (status === "loading") return <EarthLoader context="login" />;
    if (isAuthenticated && (status === "active-complete" || status === "active-incomplete")) {
        return <Navigate to="/home" replace />;
    }

    return <Outlet />;
};

export default GuestRoute;

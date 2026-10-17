import { memo, useEffect, useState } from "react";
import HeroSkeleton from "../../components/ui/HeroSkeleton";
import UsernameRootRedirect from "./UsernameRootRedirect";
import { usePublicColdEntry } from "../../layouts/PublicColdEntryBoundary";
import { usePublicAccountIdentity } from "../../features/music/PublicMusicAvailabilityProvider";
import { subscribePublicProfileInvalidation } from "../../features/PublicHome/api/publicProfileInvalidation";

interface TabVisibilityGuardProps {
    /** Which tab visibility field to check */
    tabField: "public_profile" | "public_recommendations" | "public_music" | "public_guides" | "public_movie" | "public_books" | "public_games" | "public_apps" | "public_products" | "public_people";
    /** Default visibility if the field is not set */
    defaultVisible?: boolean;
    /** The content to render if the tab is enabled */
    children: React.ReactNode;
}

/**
 * Guards a public route based on the user's tab visibility settings.
 * Optional categories require an affirmative visibility result. Hidden,
 * unavailable, or failed visibility checks return to the username root while
 * preserving attribution parameters. The primary profile lets its own query
 * and error state render because it is the fallback destination.
 */
const TabVisibilityGuard = memo(({ tabField, defaultVisible = false, children }: TabVisibilityGuardProps) => {
    const { shellRevealed } = usePublicColdEntry();
    const identity = usePublicAccountIdentity();
    const loading = identity.status === "loading";
    const error = identity.status === "terminal-error";
    const [ownerRevoked, setOwnerRevoked] = useState(false);

    useEffect(() => {
        setOwnerRevoked(false);
        const username = identity.usernameKey;
        if (!username) return;
        return subscribePublicProfileInvalidation((event) => {
            if (event.username.trim().toLowerCase() !== username) return;
            if (event.category !== tabField) return;
            // A confirmed owner unpublish must not leave a direct category URL
            // visible while the shell refresh is retrying or temporarily stale.
            if (event.action === "unpublish") setOwnerRevoked(true);
            if (event.action === "publish") setOwnerRevoked(false);
        });
    }, [identity.usernameKey, tabField]);

    // Show loader while checking visibility
    if (loading) {
        if (shellRevealed) {
            return (
                <div className="bg-black min-h-screen pt-20 px-4 md:px-6">
                    <div className="max-w-5xl mx-auto">
                        <HeroSkeleton accentColor="yellow" showThumbnails />
                    </div>
                </div>
            );
        }
        return null;
    }

    if (error && tabField !== "public_profile") {
        return <UsernameRootRedirect />;
    }

    const accountData = identity.account;

    // Optional category routes fail closed when the lookup returns no account.
    // The profile route remains the single place responsible for its own
    // not-found UI so redirects cannot loop at /:username.
    if (!accountData) {
        return tabField === "public_profile"
            ? <>{children}</>
            : <UsernameRootRedirect />;
    }

    // Check if the specific tab is enabled
    const fieldValue = tabField === "public_profile" ? "Yes" : accountData[tabField];
    const isTabEnabled = fieldValue === "Yes" || fieldValue === "No"
        ? fieldValue === "Yes"
        : defaultVisible; // Use default if field is not set (null/undefined)

    if (ownerRevoked || !isTabEnabled) {
        return <UsernameRootRedirect />;
    }

    // Tab is enabled — render the content
    return <>{children}</>;
});

export default TabVisibilityGuard;

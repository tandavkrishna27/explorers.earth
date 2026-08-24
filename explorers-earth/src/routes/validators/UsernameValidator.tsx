import { useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { gql } from "@apollo/client";
import { EarthLoader } from "../../components/EarthLoader";
import NotFound from "../../pages/NotFound";

// Query to check if username exists — intentionally minimal
const checkUsernameQuery = gql`
  query CheckUsername($username: String!) {
    accounts(filters: { username: { eq: $username } }) {
      documentId
      Account_Name
    }
  }
`;

interface UsernameValidatorProps {
  children: React.ReactNode;
}

const UsernameValidator = ({ children }: UsernameValidatorProps) => {
  const { username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const normalizedUsername = username?.trim();

  const { data, loading, error } = useQuery(checkUsernameQuery, {
    variables: { username: normalizedUsername },
    skip: !normalizedUsername,
  });

  useEffect(() => {
    if (!loading && !error && data) {
      const account = data.accounts[0];

      // If username doesn't exist, show 404
      if (!account) {
        return; // This will render NotFound component
      }

      // Normalize and sanitize path segments safely (decode + trim)
      const normalizedPath = location.pathname.replace(/\/+$/, "");
      const decodedSegments = normalizedPath
        .split("/")
        .filter(Boolean)
        .map((segment) => {
          try {
            return decodeURIComponent(segment.trim()).toLowerCase();
          } catch {
            return segment.trim().toLowerCase();
          }
        });

      // /:username
      if (decodedSegments.length === 1) {
        return; // Allow the route to render normally
      }

      // Validate nested route for /:username/*
      if (decodedSegments.length >= 2) {
        const [, ...restSegments] = decodedSegments;
        const currentRoute = restSegments[0];
        const redirectToProfileRoot = () =>
          navigate(
            {
              pathname: `/${normalizedUsername}`,
              search: location.search,
              hash: location.hash,
            },
            { replace: true },
          );
        const validRoutes = [
          "places",
          "community",
          "music",
          "guides",
          "movies",
          "books",
          "games",
          "apps",
          "products",
          "people",
        ];

        // Check if the current route is valid
        if (!validRoutes.includes(currentRoute)) {
          // Redirect to profile root for invalid top-level category
          redirectToProfileRoot();
          return;
        }

        // Additional validation for places sub-routes
        if (currentRoute === "places") {
          // `/places` (index), `/places/map`, `/places/:slug`, `/places/:slug/map` are valid
          if (restSegments.length > 3) {
            redirectToProfileRoot();
            return;
          }

          if (restSegments.length === 2 && restSegments[1] !== "map") {
            if (restSegments[1] !== "placesmap") {
              return;
            }
          }

          if (restSegments.length === 3 && restSegments[2] !== "map") {
            if (restSegments[2] !== "placesmap") {
              redirectToProfileRoot();
              return;
            }
          }
        }

        const hasInvalidLength =
          (currentRoute === "music" && restSegments.length !== 1) ||
          (currentRoute === "community" && restSegments.length !== 1) ||
          (currentRoute === "guides" &&
            !(
              restSegments.length === 1 ||
              restSegments.length === 2
            )) ||
          (currentRoute === "movies" &&
            !(
              restSegments.length === 1 ||
              restSegments.length === 2 ||
              (restSegments.length === 3 && restSegments[1] === "genre")
            )) ||
          (currentRoute === "books" &&
            !(
              restSegments.length === 1 ||
              restSegments.length === 2 ||
              (restSegments.length === 3 && restSegments[1] === "subject")
            )) ||
          (currentRoute === "games" &&
            !(
              restSegments.length === 1 ||
              restSegments.length === 2 ||
              (restSegments.length === 3 && restSegments[1] === "genre")
            )) ||
          (currentRoute === "apps" && restSegments.length > 2) ||
          (currentRoute === "products" &&
            !(
              restSegments.length === 1 ||
              restSegments.length === 2
            )) ||
          (currentRoute === "people" &&
            !(
              restSegments.length === 1 ||
              restSegments.length === 2 ||
              (restSegments.length === 3 && restSegments[1] === "sector")
            ));

        if (hasInvalidLength) {
          redirectToProfileRoot();
          return;
        }
      }
    }
  }, [
    data,
    loading,
    error,
    normalizedUsername,
    navigate,
    location.pathname,
    location.search,
    location.hash,
  ]);

  useEffect(() => {
    (window as any).__publicProfileLoaded = false;
    return () => {
      (window as any).__publicProfileLoaded = false;
    };
  }, []);

  // Show loading while checking username
  if (loading) {
    return (
      <div className="bg-black min-h-screen">
        <EarthLoader context="general" size="default" />
      </div>
    );
  }

  // Show 404 if username doesn't exist
  if (!loading && (!data || !data.accounts[0])) {
    return <NotFound />;
  }

  // Render children if username is valid
  return <>{children}</>;
};

export default UsernameValidator;

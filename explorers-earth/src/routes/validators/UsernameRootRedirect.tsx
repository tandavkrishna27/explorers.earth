import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * Returns an invalid or unavailable public-profile child route to the profile
 * root without dropping attribution parameters from the incoming URL.
 */
const UsernameRootRedirect = () => {
  const { username } = useParams();
  const location = useLocation();

  return (
    <Navigate
      replace
      to={{
        pathname: username ? `/${username}` : "/",
        search: location.search,
        hash: location.hash,
      }}
    />
  );
};

export default UsernameRootRedirect;

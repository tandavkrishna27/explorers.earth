import { lazy } from "react";
import { lazyNamed } from "./lazy";
import { Route } from "react-router-dom";
import { UsernameValidator } from "./validators";
import TabVisibilityGuard from "./validators/TabVisibilityGuard";
import UsernameRootRedirect from "./validators/UsernameRootRedirect";
import { PublicAccountIdentityProvider } from "../features/PublicHome/api/PublicAccountIdentityProvider";
import { PublicColdEntryBoundary } from "../layouts/PublicColdEntryBoundary";

const PublicLayout = lazy(() => import("../layouts/PublicLayout"));

const PublicProfile = lazy(() => import("../features/PublicHome/components/PublicProfile"));
const PublicHomePage = lazy(() => import("../pages/public/PublicHomePage"));
const MapView = lazy(() => import("../features/PublicHome/components/MapView"));
const PlaceMapView = lazy(() => import("../features/PublicHome/components/PlaceMapView"));
const PublicGuides = lazy(() => import("../features/PublicHome/components/PublicGuides"));
const PublicGuideDetailPage = lazy(() => import("../features/PublicHome/components/PublicGuideDetailPage"));
const PublicMovies = lazyNamed(() => import("../features/Movies"), "PublicMovies");
const PublicMovieList = lazyNamed(() => import("../features/Movies"), "PublicMovieList");
const PublicMovieGenre = lazyNamed(() => import("../features/Movies"), "PublicMovieGenre");
const PublicBooks = lazyNamed(() => import("../features/Books"), "PublicBooks");
const PublicBookList = lazyNamed(() => import("../features/Books"), "PublicBookList");
const PublicBookSubject = lazyNamed(() => import("../features/Books"), "PublicBookSubject");
const PublicGames = lazyNamed(() => import("../features/Games"), "PublicGames");
const PublicGamesList = lazyNamed(() => import("../features/Games"), "PublicGamesList");
const PublicGamesGenre = lazyNamed(() => import("../features/Games"), "PublicGamesGenre");
const PublicApps = lazyNamed(() => import("../features/AppsAndTools"), "PublicApps");
const PublicAppList = lazyNamed(() => import("../features/AppsAndTools"), "PublicAppList");
const PublicProducts = lazyNamed(() => import("../features/Products"), "PublicProducts");
const PublicProductList = lazyNamed(() => import("../features/Products"), "PublicProductList");
const PublicPeople = lazyNamed(() => import("../features/People"), "PublicPeople");
const PublicPersonList = lazyNamed(() => import("../features/People"), "PublicPersonList");
const PublicPersonSector = lazyNamed(() => import("../features/People"), "PublicPersonSector");

const PublicRoutes = [
  <Route
    key="public-routes"
    path=":username/*"
    element={
      <PublicColdEntryBoundary>
        <PublicAccountIdentityProvider>
          <UsernameValidator>
            <PublicLayout />
          </UsernameValidator>
        </PublicAccountIdentityProvider>
      </PublicColdEntryBoundary>
    }
  >
    <Route index element={
      <TabVisibilityGuard tabField="public_profile" defaultVisible={true}>
        <PublicProfile />
      </TabVisibilityGuard>
    } />
    <Route path="places">
      <Route index element={
        <TabVisibilityGuard tabField="public_recommendations" defaultVisible={false}>
          <PublicHomePage />
        </TabVisibilityGuard>
      } />
      <Route path=":placeSlug" element={
        <TabVisibilityGuard tabField="public_recommendations" defaultVisible={false}>
          <PublicHomePage />
        </TabVisibilityGuard>
      } />
      <Route path="map" element={
        <TabVisibilityGuard tabField="public_recommendations" defaultVisible={false}>
          <MapView />
        </TabVisibilityGuard>
      } />
      <Route path=":placeSlug/map" element={
        <TabVisibilityGuard tabField="public_recommendations" defaultVisible={false}>
          <MapView />
        </TabVisibilityGuard>
      } />
      <Route path=":place/placesmap" element={
        <TabVisibilityGuard tabField="public_recommendations" defaultVisible={false}>
          <PlaceMapView />
        </TabVisibilityGuard>
      } />
    </Route>
    <Route path="guides">
      <Route index element={
        <TabVisibilityGuard tabField="public_guides" defaultVisible={false}>
          <PublicGuides />
        </TabVisibilityGuard>
      } />
      <Route path=":guideSlug" element={
        <TabVisibilityGuard tabField="public_guides" defaultVisible={false}>
          <PublicGuideDetailPage />
        </TabVisibilityGuard>
      } />
    </Route>
    {/* Movies & Shows public routes */}
    <Route path="movies">
      <Route index element={
        <TabVisibilityGuard tabField="public_movie" defaultVisible={false}>
          <PublicMovies />
        </TabVisibilityGuard>
      } />
      <Route path="genre/:genreSlug" element={
        <TabVisibilityGuard tabField="public_movie" defaultVisible={false}>
          <PublicMovieGenre />
        </TabVisibilityGuard>
      } />
      <Route path=":listSlug" element={
        <TabVisibilityGuard tabField="public_movie" defaultVisible={false}>
          <PublicMovieList />
        </TabVisibilityGuard>
      } />
    </Route>

    {/* Books public routes */}
    <Route path="books">
      <Route index element={
        <TabVisibilityGuard tabField="public_books" defaultVisible={false}>
          <PublicBooks />
        </TabVisibilityGuard>
      } />
      <Route path="subject/:subjectSlug" element={
        <TabVisibilityGuard tabField="public_books" defaultVisible={false}>
          <PublicBookSubject />
        </TabVisibilityGuard>
      } />
      <Route path=":listSlug" element={
        <TabVisibilityGuard tabField="public_books" defaultVisible={false}>
          <PublicBookList />
        </TabVisibilityGuard>
      } />
    </Route>

    {/* Games public routes */}
    <Route path="games">
      <Route index element={
        <TabVisibilityGuard tabField="public_games" defaultVisible={false}>
          <PublicGames />
        </TabVisibilityGuard>
      } />
      <Route path="genre/:genreSlug" element={
        <TabVisibilityGuard tabField="public_games" defaultVisible={false}>
          <PublicGamesGenre />
        </TabVisibilityGuard>
      } />
      <Route path=":listSlug" element={
        <TabVisibilityGuard tabField="public_games" defaultVisible={false}>
          <PublicGamesList />
        </TabVisibilityGuard>
      } />
    </Route>

    {/* Apps & Tools public routes */}
    <Route path="apps">
      <Route index element={
        <TabVisibilityGuard tabField="public_apps" defaultVisible={false}>
          <PublicApps />
        </TabVisibilityGuard>
      } />
      <Route path=":listSlug" element={
        <TabVisibilityGuard tabField="public_apps" defaultVisible={false}>
          <PublicAppList />
        </TabVisibilityGuard>
      } />
    </Route>

    {/* Products public routes */}
    <Route path="products">
      <Route index element={
        <TabVisibilityGuard tabField="public_products" defaultVisible={false}>
          <PublicProducts />
        </TabVisibilityGuard>
      } />
      <Route path=":listSlug" element={
        <TabVisibilityGuard tabField="public_products" defaultVisible={false}>
          <PublicProductList />
        </TabVisibilityGuard>
      } />
    </Route>

    {/* People public routes */}
    <Route path="people">
      <Route index element={
        <TabVisibilityGuard tabField="public_people" defaultVisible={false}>
          <PublicPeople />
        </TabVisibilityGuard>
      } />
      <Route path="sector/:sectorSlug" element={
        <TabVisibilityGuard tabField="public_people" defaultVisible={false}>
          <PublicPersonSector />
        </TabVisibilityGuard>
      } />
      <Route path=":listSlug" element={
        <TabVisibilityGuard tabField="public_people" defaultVisible={false}>
          <PublicPersonList />
        </TabVisibilityGuard>
      } />
    </Route>
    <Route path="*" element={<UsernameRootRedirect />} />
  </Route>,
];

export default PublicRoutes;


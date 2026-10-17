import { Route } from "react-router-dom";

// Import components
import PublicProfile from "../features/PublicHome/components/PublicProfile";
import PublicHomePage from "../pages/public/PublicHomePage";
import MapView from "../features/PublicHome/components/MapView";
import PlaceMapView from "../features/PublicHome/components/PlaceMapView";
import PublicGuides from "../features/PublicHome/components/PublicGuides";
import PublicGuideDetailPage from "../features/PublicHome/components/PublicGuideDetailPage";
import { UsernameValidator } from "./validators";
import TabVisibilityGuard from "./validators/TabVisibilityGuard";
import UsernameRootRedirect from "./validators/UsernameRootRedirect";
import { PublicMovies, PublicMovieList, PublicMovieGenre } from "../features/Movies";
import { PublicBooks, PublicBookList, PublicBookSubject } from "../features/Books";
import { PublicGames, PublicGamesList, PublicGamesGenre } from "../features/Games";
import { PublicApps, PublicAppList } from "../features/AppsAndTools";
import { PublicProducts, PublicProductList } from "../features/Products";
import { PublicPeople, PublicPersonList, PublicPersonSector } from "../features/People";
import ProfileMusic from "../pages/public/ProfileMusic";
import PublicMusicVisibilityBoundary from "./validators/PublicMusicVisibilityBoundary";
import { PublicMusicAvailabilityProvider } from "../features/music/PublicMusicAvailabilityProvider";

// Import layout
import PublicLayout from "../layouts/PublicLayout";
import { PublicColdEntryBoundary } from "../layouts/PublicColdEntryBoundary";

const PublicRoutes = [
  <Route
    key="public-routes"
    path=":username/*"
    element={
      <PublicColdEntryBoundary>
        <PublicMusicAvailabilityProvider>
          <UsernameValidator>
            <PublicLayout />
          </UsernameValidator>
        </PublicMusicAvailabilityProvider>
      </PublicColdEntryBoundary>
    }
  >
    <Route index element={
      <TabVisibilityGuard tabField="public_profile" defaultVisible={true}>
        <PublicProfile />
      </TabVisibilityGuard>
    } />
    <Route path="music" element={
      <PublicMusicVisibilityBoundary>
        <ProfileMusic />
      </PublicMusicVisibilityBoundary>
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


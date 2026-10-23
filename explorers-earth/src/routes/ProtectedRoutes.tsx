import { lazy, type ReactElement } from "react";
import { lazyNamed } from "./lazy";
import { Route, Navigate, useParams } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";

const ResponsiveLayout = lazy(() => import("../layouts/ResponsiveLayout"));

const OnBoarding = lazy(() => import("../pages/OnBoarding"));
const Profile = lazy(() => import("../pages/Profile"));
const Favorites = lazy(() => import("../pages/Favorites"));
const Analytics = lazy(() => import("../pages/Analytics"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const Home = lazy(() => import("../pages/Home"));
const RecommendationsHub = lazy(() => import("../pages/RecommendationsHub"));
const AddRecommendation = lazy(() => import("../features/Favorites/components/AddRecommendation"));
const GuidesPage = lazyNamed(() => import("../features/Guides"), "GuidesPage");
const GuideEditorPage = lazyNamed(() => import("../features/Guides"), "GuideEditorPage");
const GuideSectionFormPage = lazyNamed(() => import("../features/Guides"), "GuideSectionFormPage");
const MoviesHome = lazyNamed(() => import("../features/Movies"), "MoviesHome");
const MovieListView = lazyNamed(() => import("../features/Movies"), "MovieListView");
const AddMoviePage = lazyNamed(() => import("../features/Movies"), "AddMoviePage");
const BooksHome = lazyNamed(() => import("../features/Books"), "BooksHome");
const BookListView = lazyNamed(() => import("../features/Books"), "BookListView");
const AddBookPage = lazyNamed(() => import("../features/Books"), "AddBookPage");
const GamesHome = lazyNamed(() => import("../features/Games"), "GamesHome");
const GameListView = lazyNamed(() => import("../features/Games"), "GameListView");
const AddGamePage = lazyNamed(() => import("../features/Games"), "AddGamePage");
const AppsHome = lazyNamed(() => import("../features/AppsAndTools"), "AppsHome");
const AppListView = lazyNamed(() => import("../features/AppsAndTools"), "AppListView");
const AddAppPage = lazyNamed(() => import("../features/AppsAndTools"), "AddAppPage");
const ProductsHome = lazyNamed(() => import("../features/Products"), "ProductsHome");
const ProductListView = lazyNamed(() => import("../features/Products"), "ProductListView");
const AddProductPage = lazyNamed(() => import("../features/Products"), "AddProductPage");
const PeopleHome = lazyNamed(() => import("../features/People"), "PeopleHome");
const PersonListView = lazyNamed(() => import("../features/People"), "PersonListView");
const AddPersonPage = lazyNamed(() => import("../features/People"), "AddPersonPage");
const AddLinkedPeoplePage = lazy(() => import("../features/Favorites/components/AddLinkedPeoplePage"));
const AddLinkedProductsPage = lazy(() => import("../features/Favorites/components/AddLinkedProductsPage"));

/** Old guide addresses land in the in-page editor; /edit opens its Manage tab. */
function GuideEditorPageRedirect({ tab }: { tab?: "manage" }) {
  const { guideId = "" } = useParams();
  return <Navigate to={`/recommendations/guides/${guideId}`} state={tab ? { tab } : undefined} replace />;
}

const ProtectedRoutes = (): ReactElement[] => {
  const dashboardRoutes = (
    <Route key="dashboard-routes" path="/*" element={<ResponsiveLayout />}>
      <Route path="profile" element={<Profile />} />
      <Route path="recommendations" element={<RecommendationsHub />} />
      <Route path="recommendations/places" element={<Favorites />} />
      <Route path="recommendations/guides" element={<GuidesPage />} />
      <Route path="recommendations/guides/new" element={<Navigate to="/recommendations/guides?new=1" replace />} />
      <Route path="recommendations/guides/:guideId" element={<GuideEditorPage />} />
      <Route path="recommendations/guides/:guideId/edit" element={<GuideEditorPageRedirect tab="manage" />} />
      <Route path="recommendations/guides/:guideId/sections/new" element={<GuideSectionFormPage />} />
      <Route path="recommendations/guides/:guideId/sections/:sectionId/edit" element={<GuideSectionFormPage />} />
      <Route path="recommendations/music" element={<Navigate to="/recommendations" replace />} />

      {/* Legacy redirects & aliases */}
      <Route path="guides" element={<Navigate to="/recommendations/guides" replace />} />
      <Route path="guides/new" element={<Navigate to="/recommendations/guides?new=1" replace />} />
      <Route path="guides/:guideId" element={<GuideEditorPageRedirect />} />
      <Route path="guides/:guideId/edit" element={<GuideEditorPageRedirect tab="manage" />} />
      <Route path="guides/:guideId/sections/new" element={<GuideSectionFormPage />} />
      <Route path="guides/:guideId/sections/:sectionId/edit" element={<GuideSectionFormPage />} />
      <Route path="music" element={<Navigate to="/recommendations" replace />} />
      <Route path="hub" element={<Navigate to="/recommendations" replace />} />

      <Route path="analytics" element={<Analytics />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="home" element={<Home />} />
      <Route path="recommendations/movies" element={<MoviesHome />} />
      <Route path="recommendations/movies/:listId" element={<MovieListView />} />
      <Route path="recommendations/movies/:listId/add" element={<AddMoviePage />} />
      <Route path="recommendations/movies/:listId/edit/:movieId" element={<AddMoviePage />} />
      <Route path="recommendations/books" element={<BooksHome />} />
      <Route path="recommendations/books/:listId" element={<BookListView />} />
      <Route path="recommendations/books/:listId/add" element={<AddBookPage />} />
      <Route path="recommendations/books/:listId/edit/:bookId" element={<AddBookPage />} />
      <Route path="recommendations/games" element={<GamesHome />} />
      <Route path="recommendations/games/:listId" element={<GameListView />} />
      <Route path="recommendations/games/:listId/add" element={<AddGamePage />} />
      <Route path="recommendations/games/:listId/edit/:gameId" element={<AddGamePage />} />
      <Route path="recommendations/apps" element={<AppsHome />} />
      <Route path="recommendations/apps/:listId" element={<AppListView />} />
      <Route path="recommendations/apps/:listId/add" element={<AddAppPage />} />
      <Route path="recommendations/apps/:listId/edit/:appId" element={<AddAppPage />} />
      <Route path="recommendations/products" element={<ProductsHome />} />
      <Route path="recommendations/products/:listId" element={<ProductListView />} />
      <Route path="recommendations/products/:listId/add" element={<AddProductPage />} />
      <Route path="recommendations/products/:listId/edit/:productId" element={<AddProductPage />} />
      <Route path="recommendations/people" element={<PeopleHome />} />
      <Route path="recommendations/people/:listId" element={<PersonListView />} />
      <Route path="recommendations/people/:listId/add" element={<AddPersonPage />} />
      <Route path="recommendations/people/:listId/edit/:personId" element={<AddPersonPage />} />
      <Route path="recommendations/places/:locationId/add-people" element={<AddLinkedPeoplePage />} />
      <Route path="recommendations/places/:locationId/add-products" element={<AddLinkedProductsPage />} />
      <Route path=":listId/new" element={<AddRecommendation />} />
      <Route path=":placeId/edit" element={<AddRecommendation type="edit" />} />
    </Route>
  );

  return [
    <Route key="protected-wrapper" element={<ProtectedRoute />}>
      <Route key="onboarding" path="/onboarding" element={<OnBoarding />} />
      {dashboardRoutes}
    </Route>,
  ];
};

export default ProtectedRoutes;

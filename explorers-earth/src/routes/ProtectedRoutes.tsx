import { ReactElement } from "react";
import { Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";

// Import components
import OnBoarding from "../pages/OnBoarding";
import Profile from "../pages/Profile";
import Favorites from "../pages/Favorites";
import Analytics from "../pages/Analytics";
import SettingsPage from "../pages/SettingsPage";
import Home from "../pages/Home";
import RecommendationsHub from "../pages/RecommendationsHub";
import Music from "../pages/Music";
import Instagram from "../pages/Instagram";
import SubscriptionPlans from "../pages/SubscriptionPlans";
import Checkout from "../pages/Checkout";
import AddRecommendation from "../features/Favorites/components/AddRecommendation";
import {
  GuidesPage,
  CreateGuidePage,
  GuideDetailsPage,
  GuideSectionFormPage,
} from "../features/Guides";
import { MoviesHome, MovieListView, AddMoviePage } from "../features/Movies";
import { BooksHome, BookListView, AddBookPage } from "../features/Books";
import { GamesHome, GameListView, AddGamePage } from "../features/Games";
import { AppsHome, AppListView, AddAppPage } from "../features/AppsAndTools";
import { ProductsHome, ProductListView, AddProductPage } from "../features/Products";
import { PeopleHome, PersonListView, AddPersonPage } from "../features/People";
import AddLinkedPeoplePage from "../features/Favorites/components/AddLinkedPeoplePage";
import AddLinkedProductsPage from "../features/Favorites/components/AddLinkedProductsPage";

// Import layouts
import DashboardLayout from "../layouts/DashboardLayout";
import MobileLayout from "../layouts/MobileLayout";

interface ProtectedRoutesProps {
  isDesktop: boolean;
}

const ProtectedRoutes = ({
  isDesktop,
}: ProtectedRoutesProps): ReactElement[] => {
  const desktopRoutes = (
    <Route key="desktop-routes" path="/*" element={<DashboardLayout />}>
      <Route path="profile" element={<Profile />} />
      <Route path="recommendations" element={<RecommendationsHub />} />
      <Route path="recommendations/places" element={<Favorites />} />
      <Route path="recommendations/guides" element={<GuidesPage />} />
      <Route path="recommendations/guides/new" element={<CreateGuidePage />} />
      <Route path="recommendations/guides/:guideId" element={<GuideDetailsPage />} />
      <Route path="recommendations/guides/:guideId/edit" element={<CreateGuidePage type="edit" />} />
      <Route path="recommendations/guides/:guideId/sections/new" element={<GuideSectionFormPage />} />
      <Route path="recommendations/guides/:guideId/sections/:sectionId/edit" element={<GuideSectionFormPage />} />
      <Route path="recommendations/music" element={<Music />} />

      {/* Legacy redirects & aliases */}
      <Route path="guides" element={<Navigate to="/recommendations/guides" replace />} />
      <Route path="guides/new" element={<CreateGuidePage />} />
      <Route path="guides/:guideId" element={<GuideDetailsPage />} />
      <Route path="guides/:guideId/edit" element={<CreateGuidePage type="edit" />} />
      <Route path="guides/:guideId/sections/new" element={<GuideSectionFormPage />} />
      <Route path="guides/:guideId/sections/:sectionId/edit" element={<GuideSectionFormPage />} />
      <Route path="music" element={<Navigate to="/recommendations/music" replace />} />
      <Route path="hub" element={<Navigate to="/recommendations" replace />} />

      <Route path="analytics" element={<Analytics />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="home" element={<Home />} />
      <Route path="instagram" element={<Instagram />} />
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

  const mobileRoutes = (
    <Route key="mobile-routes" path="/*" element={<MobileLayout />}>
      <Route path="profile" element={<Profile />} />
      <Route path="recommendations" element={<RecommendationsHub />} />
      <Route path="recommendations/places" element={<Favorites />} />
      <Route path="recommendations/guides" element={<GuidesPage />} />
      <Route path="recommendations/guides/new" element={<CreateGuidePage />} />
      <Route path="recommendations/guides/:guideId" element={<GuideDetailsPage />} />
      <Route path="recommendations/guides/:guideId/edit" element={<CreateGuidePage type="edit" />} />
      <Route path="recommendations/guides/:guideId/sections/new" element={<GuideSectionFormPage />} />
      <Route path="recommendations/guides/:guideId/sections/:sectionId/edit" element={<GuideSectionFormPage />} />
      <Route path="recommendations/music" element={<Music />} />

      {/* Legacy redirects & aliases */}
      <Route path="guides" element={<Navigate to="/recommendations/guides" replace />} />
      <Route path="guides/new" element={<CreateGuidePage />} />
      <Route path="guides/:guideId" element={<GuideDetailsPage />} />
      <Route path="guides/:guideId/edit" element={<CreateGuidePage type="edit" />} />
      <Route path="guides/:guideId/sections/new" element={<GuideSectionFormPage />} />
      <Route path="guides/:guideId/sections/:sectionId/edit" element={<GuideSectionFormPage />} />
      <Route path="music" element={<Navigate to="/recommendations/music" replace />} />
      <Route path="hub" element={<Navigate to="/recommendations" replace />} />

      <Route path="analytics" element={<Analytics />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="home" element={<Home />} />
      <Route path="instagram" element={<Instagram />} />
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
      <Route key="subscription-plans" path="/subscription-plans" element={<SubscriptionPlans />} />
      <Route key="checkout" path="/checkout" element={<Checkout />} />
      <Route key="onboarding" path="/onboarding" element={<OnBoarding />} />
      {isDesktop ? desktopRoutes : mobileRoutes}
    </Route>,
  ];
};

export default ProtectedRoutes;

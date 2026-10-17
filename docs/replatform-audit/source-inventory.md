# Source inventory

Commit `5253fcb21a46caabb7512bf6de5762b952705f31`. All tracked runtime TS/JS source; excludes test directories and test/spec files. Parse gql template literals; occurrences count separately, not unique names or proven live operations. TypeScript AST additionally identifies untagged operation strings/templates. REST lines are candidates, not registered endpoints.

## Tagged GraphQL operation counts

```json
{
  "Explorers": {
    "query": 79,
    "mutation": 73,
    "subscription": 0
  },
  "Tunes": {
    "query": 1,
    "mutation": 4,
    "subscription": 0
  }
}
```

Parse failures: 0. Untagged client and server GraphQL strings/templates are separately inventoried below; these counts exclude them. See the architecture report for combined totals.

## GraphQL declarations

| Kind | Name | Root fields | Source |
|---|---|---|---|
| mutation | CreateAppList | createAppList | explorers-earth/src/features/AppsAndTools/api/mutation.ts:6 |
| mutation | UpdateAppList | updateAppList | explorers-earth/src/features/AppsAndTools/api/mutation.ts:40 |
| mutation | DeleteAppList | deleteAppList | explorers-earth/src/features/AppsAndTools/api/mutation.ts:76 |
| mutation | CreateRecommendedApp | createRecommendedApp | explorers-earth/src/features/AppsAndTools/api/mutation.ts:87 |
| mutation | UpdateRecommendedApp | updateRecommendedApp | explorers-earth/src/features/AppsAndTools/api/mutation.ts:138 |
| mutation | DeleteRecommendedApp | deleteRecommendedApp | explorers-earth/src/features/AppsAndTools/api/mutation.ts:188 |
| mutation | ToggleAppPin | updateRecommendedApp | explorers-earth/src/features/AppsAndTools/api/mutation.ts:199 |
| query | AppListsByAccount | appLists | explorers-earth/src/features/AppsAndTools/api/query.ts:86 |
| query | AppsByList | appLists | explorers-earth/src/features/AppsAndTools/api/query.ts:137 |
| query | PinnedApps | recommendedApps | explorers-earth/src/features/AppsAndTools/api/query.ts:195 |
| query | PublicAppData | appLists, recommendedApps | explorers-earth/src/features/AppsAndTools/api/query.ts:235 |
| query | AppListBySlug | appLists | explorers-earth/src/features/AppsAndTools/api/query.ts:299 |
| query | AppsByCategory | recommendedApps | explorers-earth/src/features/AppsAndTools/api/query.ts:349 |
| query | AppCategories | appCategories | explorers-earth/src/features/AppsAndTools/api/query.ts:387 |
| mutation | register | register | explorers-earth/src/features/Authentication/api/mutation.ts:4 |
| mutation | login | login | explorers-earth/src/features/Authentication/api/mutation.ts:20 |
| mutation | forgotPassword | forgotPassword | explorers-earth/src/features/Authentication/api/mutation.ts:36 |
| mutation | Mutation | resetPassword | explorers-earth/src/features/Authentication/api/mutation.ts:44 |
| mutation | CreateVerifyClaim | createVerifyClaim | explorers-earth/src/features/Authentication/api/queries.ts:4 |
| query | CheckClaimablePlaceProfileByPhone | claimablePlaceProfiles | explorers-earth/src/features/Authentication/api/queries.ts:25 |
| query | CheckClaimablePlaceProfileByAddress | claimablePlaceProfiles | explorers-earth/src/features/Authentication/api/queries.ts:51 |
| query | GetCurrentUser | usersPermissionsUser | explorers-earth/src/features/Authentication/api/userQueries.ts:7 |
| query | GetUserForOnboarding | usersPermissionsUser | explorers-earth/src/features/Authentication/api/userQueries.ts:25 |
| mutation | CreateBookList | createBookList | explorers-earth/src/features/Books/api/mutation.ts:6 |
| mutation | UpdateBookList | updateBookList | explorers-earth/src/features/Books/api/mutation.ts:40 |
| mutation | DeleteBookList | deleteBookList | explorers-earth/src/features/Books/api/mutation.ts:76 |
| mutation | CreateRecommendedBook | createRecommendedBook | explorers-earth/src/features/Books/api/mutation.ts:87 |
| mutation | UpdateRecommendedBook | updateRecommendedBook | explorers-earth/src/features/Books/api/mutation.ts:153 |
| mutation | DeleteRecommendedBook | deleteRecommendedBook | explorers-earth/src/features/Books/api/mutation.ts:191 |
| mutation | ToggleBookPin | updateRecommendedBook | explorers-earth/src/features/Books/api/mutation.ts:202 |
| query | BookListsByAccount | bookLists | explorers-earth/src/features/Books/api/query.ts:6 |
| query | BooksByList | bookLists | explorers-earth/src/features/Books/api/query.ts:61 |
| query | BookDetails | recommendedBooks | explorers-earth/src/features/Books/api/query.ts:131 |
| query | PinnedBooks | recommendedBooks | explorers-earth/src/features/Books/api/query.ts:177 |
| query | BooksBySubject | recommendedBooks | explorers-earth/src/features/Books/api/query.ts:223 |
| query | BookListBySlug | bookLists | explorers-earth/src/features/Books/api/query.ts:259 |
| query | PublicBookData | bookLists | explorers-earth/src/features/Books/api/query.ts:313 |
| query | BookCategories | bookCategories | explorers-earth/src/features/Books/api/query.ts:367 |
| mutation | CreateRecommendationList | createRecommendationList | explorers-earth/src/features/Favorites/api/mutation.ts:3 |
| mutation | CreateRecommendationCategory | createRecommendationCategory | explorers-earth/src/features/Favorites/api/mutation.ts:25 |
| mutation | CreateRecommendedPlace | createRecommendedPlace | explorers-earth/src/features/Favorites/api/mutation.ts:34 |
| mutation | DeleteRecommendationList | deleteRecommendationList | explorers-earth/src/features/Favorites/api/mutation.ts:42 |
| mutation | UpdateRecommendationList | updateRecommendationList | explorers-earth/src/features/Favorites/api/mutation.ts:50 |
| mutation | updateRecommendedList | updateRecommendationList | explorers-earth/src/features/Favorites/api/mutation.ts:61 |
| mutation | delete | deleteRecommendedPlace | explorers-earth/src/features/Favorites/api/mutation.ts:80 |
| mutation | update | updateRecommendedPlace | explorers-earth/src/features/Favorites/api/mutation.ts:88 |
| mutation | CreateRecommendedPerson | createRecommendedPlace | explorers-earth/src/features/Favorites/api/mutation.ts:97 |
| mutation | updatePerson | updateRecommendedPlace | explorers-earth/src/features/Favorites/api/mutation.ts:105 |
| mutation | CreateClaimablePlaceProfile | createClaimablePlaceProfile | explorers-earth/src/features/Favorites/api/mutation.ts:114 |
| mutation | UpdateClaimablePlaceProfile | updateClaimablePlaceProfile | explorers-earth/src/features/Favorites/api/mutation.ts:136 |
| query | FindClaimablePlaceProfileByPlaceId | claimablePlaceProfiles | explorers-earth/src/features/Favorites/api/mutation.ts:158 |
| mutation | UpdateAccountVisibility | updateAccount | explorers-earth/src/features/Favorites/api/mutation.ts:179 |
| query | UsersPermissionsUser | usersPermissionsUser | explorers-earth/src/features/Favorites/api/query.ts:3 |
| query | RecommendationLists | recommendationLists | explorers-earth/src/features/Favorites/api/query.ts:14 |
| query | RecommendationCategories | recommendationCategories | explorers-earth/src/features/Favorites/api/query.ts:38 |
| query | RecommendationLists | recommendationList | explorers-earth/src/features/Favorites/api/query.ts:51 |
| query | recommendedplace | recommendedPlace | explorers-earth/src/features/Favorites/api/query.ts:127 |
| query | RecommendedPlaces | recommendedPlaces | explorers-earth/src/features/Favorites/api/query.ts:161 |
| query | AllRecommendedPlaces | recommendationList | explorers-earth/src/features/Favorites/api/query.ts:184 |
| query | (anonymous) | claimablePlaceProfiles | explorers-earth/src/features/Favorites/services/claimablePlaceProfileService.ts:47 |
| mutation | CreateGameList | createGameList | explorers-earth/src/features/Games/api/mutation.ts:6 |
| mutation | UpdateGameList | updateGameList | explorers-earth/src/features/Games/api/mutation.ts:40 |
| mutation | DeleteGameList | deleteGameList | explorers-earth/src/features/Games/api/mutation.ts:76 |
| mutation | CreateRecommendedGame | createRecommendedGame | explorers-earth/src/features/Games/api/mutation.ts:87 |
| mutation | UpdateRecommendedGame | updateRecommendedGame | explorers-earth/src/features/Games/api/mutation.ts:159 |
| mutation | DeleteRecommendedGame | deleteRecommendedGame | explorers-earth/src/features/Games/api/mutation.ts:195 |
| mutation | ToggleGamePin | updateRecommendedGame | explorers-earth/src/features/Games/api/mutation.ts:206 |
| query | GameListsByAccount | gameLists | explorers-earth/src/features/Games/api/query.ts:69 |
| query | GamesByList | gameLists | explorers-earth/src/features/Games/api/query.ts:133 |
| query | GameDetails | recommendedGames | explorers-earth/src/features/Games/api/query.ts:208 |
| query | PinnedGames | recommendedGames | explorers-earth/src/features/Games/api/query.ts:257 |
| query | GamesByGenre | recommendedGames | explorers-earth/src/features/Games/api/query.ts:303 |
| query | GameListBySlug | gameLists | explorers-earth/src/features/Games/api/query.ts:337 |
| query | PublicGameData | gameLists, recommendedGames | explorers-earth/src/features/Games/api/query.ts:390 |
| query | GameCategories | gameCategories | explorers-earth/src/features/Games/api/query.ts:462 |
| mutation | CreateGuide | createGuide | explorers-earth/src/features/Guides/api/mutations.ts:3 |
| mutation | UpdateGuide | updateGuide | explorers-earth/src/features/Guides/api/mutations.ts:19 |
| mutation | DeleteGuide | deleteGuide | explorers-earth/src/features/Guides/api/mutations.ts:37 |
| mutation | CreateGuideSection | createGuideSection | explorers-earth/src/features/Guides/api/mutations.ts:45 |
| mutation | UpdateGuideSection | updateGuideSection | explorers-earth/src/features/Guides/api/mutations.ts:65 |
| mutation | DeleteGuideSection | deleteGuideSection | explorers-earth/src/features/Guides/api/mutations.ts:85 |
| query | GetUserAccount | usersPermissionsUser | explorers-earth/src/features/Guides/api/queries.ts:4 |
| query | GetGuideCategories | guideCategories | explorers-earth/src/features/Guides/api/queries.ts:20 |
| mutation | CreateMovieList | createMovieList | explorers-earth/src/features/Movies/api/mutation.ts:6 |
| mutation | UpdateMovieList | updateMovieList | explorers-earth/src/features/Movies/api/mutation.ts:40 |
| mutation | DeleteMovieList | deleteMovieList | explorers-earth/src/features/Movies/api/mutation.ts:76 |
| mutation | CreateRecommendedMovie | createRecommendedMovie | explorers-earth/src/features/Movies/api/mutation.ts:87 |
| mutation | UpdateRecommendedMovie | updateRecommendedMovie | explorers-earth/src/features/Movies/api/mutation.ts:154 |
| mutation | DeleteRecommendedMovie | deleteRecommendedMovie | explorers-earth/src/features/Movies/api/mutation.ts:194 |
| mutation | ToggleMoviePin | updateRecommendedMovie | explorers-earth/src/features/Movies/api/mutation.ts:205 |
| query | MovieListsByAccount | movieLists | explorers-earth/src/features/Movies/api/query.ts:6 |
| query | MoviesByList | movieLists | explorers-earth/src/features/Movies/api/query.ts:66 |
| query | MovieDetails | recommendedMovies | explorers-earth/src/features/Movies/api/query.ts:136 |
| query | PinnedMovies | recommendedMovies | explorers-earth/src/features/Movies/api/query.ts:182 |
| query | MoviesByGenre | recommendedMovies | explorers-earth/src/features/Movies/api/query.ts:217 |
| query | MovieListBySlug | movieLists | explorers-earth/src/features/Movies/api/query.ts:253 |
| query | PublicMovieData | movieLists | explorers-earth/src/features/Movies/api/query.ts:307 |
| query | MovieCategories | movieCategories | explorers-earth/src/features/Movies/api/query.ts:361 |
| mutation | CreatePersonList | createPersonList | explorers-earth/src/features/People/api/mutation.ts:6 |
| mutation | UpdatePersonList | updatePersonList | explorers-earth/src/features/People/api/mutation.ts:42 |
| mutation | DeletePersonList | deletePersonList | explorers-earth/src/features/People/api/mutation.ts:78 |
| mutation | CreateRecommendedPerson | createRecommendedPerson | explorers-earth/src/features/People/api/mutation.ts:89 |
| mutation | UpdateRecommendedPerson | updateRecommendedPerson | explorers-earth/src/features/People/api/mutation.ts:144 |
| mutation | DeleteRecommendedPerson | deleteRecommendedPerson | explorers-earth/src/features/People/api/mutation.ts:200 |
| mutation | TogglePersonPin | updateRecommendedPerson | explorers-earth/src/features/People/api/mutation.ts:211 |
| query | PersonListsByAccount | personLists | explorers-earth/src/features/People/api/query.ts:88 |
| query | PeopleByList | personLists | explorers-earth/src/features/People/api/query.ts:138 |
| query | PinnedPeople | recommendedPeople | explorers-earth/src/features/People/api/query.ts:195 |
| query | PublicPeopleData | personLists | explorers-earth/src/features/People/api/query.ts:235 |
| query | PersonListBySlug | personLists | explorers-earth/src/features/People/api/query.ts:282 |
| query | PersonCategories | peopleCategories | explorers-earth/src/features/People/api/query.ts:331 |
| mutation | CreateProductList | createProductList | explorers-earth/src/features/Products/api/mutation.ts:6 |
| mutation | UpdateProductList | updateProductList | explorers-earth/src/features/Products/api/mutation.ts:42 |
| mutation | DeleteProductList | deleteProductList | explorers-earth/src/features/Products/api/mutation.ts:78 |
| mutation | CreateRecommendedProduct | createRecommendedProduct | explorers-earth/src/features/Products/api/mutation.ts:89 |
| mutation | UpdateRecommendedProduct | updateRecommendedProduct | explorers-earth/src/features/Products/api/mutation.ts:142 |
| mutation | DeleteRecommendedProduct | deleteRecommendedProduct | explorers-earth/src/features/Products/api/mutation.ts:194 |
| mutation | ToggleProductPin | updateRecommendedProduct | explorers-earth/src/features/Products/api/mutation.ts:205 |
| query | ProductListsByAccount | productLists | explorers-earth/src/features/Products/api/query.ts:87 |
| query | ProductsByList | productLists | explorers-earth/src/features/Products/api/query.ts:139 |
| query | PinnedProducts | recommendedProducts | explorers-earth/src/features/Products/api/query.ts:198 |
| query | PublicProductData | productLists, recommendedProducts | explorers-earth/src/features/Products/api/query.ts:238 |
| query | ProductListBySlug | productLists | explorers-earth/src/features/Products/api/query.ts:302 |
| query | ProductsByCategory | recommendedProducts | explorers-earth/src/features/Products/api/query.ts:353 |
| query | ProductCategories | productCategories | explorers-earth/src/features/Products/api/query.ts:391 |
| query | GetDashboardStatus | usersPermissionsUser | explorers-earth/src/features/Profile/api/UserStatus.ts:5 |
| query | PublicCategoryListCounts | recommendationLists, bookLists, movieLists, gameLists, appLists, productLists, personLists, guides | explorers-earth/src/features/PublicHome/api/query.ts:5 |
| query | RecommendationLists | recommendationLists | explorers-earth/src/features/PublicHome/api/query.ts:42 |
| query | RecommendationCategories | recommendationCategories | explorers-earth/src/features/PublicHome/api/query.ts:60 |
| query | RecommendationLists | recommendationList | explorers-earth/src/features/PublicHome/api/query.ts:73 |
| query | user | accounts | explorers-earth/src/features/PublicHome/api/query.ts:88 |
| query | LinkedListsForRecommendation | personLists, productLists | explorers-earth/src/features/PublicHome/api/query.ts:152 |
| query | user | accounts | explorers-earth/src/features/PublicHome/api/query.ts:225 |
| query | RecommendedPlace | recommendedPlace | explorers-earth/src/features/PublicHome/api/query.ts:337 |
| query | Account | accounts | explorers-earth/src/features/PublicHome/api/query.ts:362 |
| query | Account | accounts | explorers-earth/src/features/PublicHome/api/query.ts:383 |
| query | PublicAccountBasic | accounts | explorers-earth/src/features/PublicHome/api/query.ts:407 |
| query | PublicProfileData | accounts | explorers-earth/src/features/PublicHome/api/query.ts:441 |
| query | Account | accounts | explorers-earth/src/features/PublicHome/api/query.ts:478 |
| query | Account | account | explorers-earth/src/features/PublicHome/api/query.ts:513 |
| query | Account | account | explorers-earth/src/features/PublicHome/api/query.ts:521 |
| mutation | update | changePassword | explorers-earth/src/features/Settings/api/mutation.ts:3 |
| mutation | UpdateUsersPermissionsUser | updateUsersPermissionsUser | explorers-earth/src/features/Settings/api/mutation.ts:21 |
| mutation | DeleteExplorerAccount | deleteAccount | explorers-earth/src/features/Settings/api/mutation.ts:34 |
| mutation | DeleteExplorerUser | deleteRecommendationList, deleteUsersPermissionsUser | explorers-earth/src/features/Settings/api/mutation.ts:42 |
| query | Account | accounts | explorers-earth/src/features/Settings/api/mutation.ts:62 |
| mutation | UpdateAccount | updateAccount | explorers-earth/src/features/Settings/api/mutation.ts:82 |
| mutation | UpdateTabVisibility | updateAccount | explorers-earth/src/features/Settings/api/mutation.ts:102 |
| query | UsersPermissionsUser | usersPermissionsUser | explorers-earth/src/features/Settings/api/mutation.ts:122 |
| mutation | AddReasonForLeaving | createReasonForLeaving | explorers-earth/src/features/Settings/api/mutation.ts:134 |
| query | CheckPublishedLists | bookLists, gameLists, appLists, productLists, movieLists, personLists, guides, recommendationLists | explorers-earth/src/features/Settings/api/mutation.ts:143 |
| query | CategoryNavigationAccount | usersPermissionsUser | explorers-earth/src/features/navigation/categoryNavigationApi.ts:9 |
| mutation | login | login | tunes/client/src/lib/graphql-mutations.ts:9 |
| mutation | register | register | tunes/client/src/lib/graphql-mutations.ts:25 |
| mutation | forgotPassword | forgotPassword | tunes/client/src/lib/graphql-mutations.ts:41 |
| mutation | resetPassword | resetPassword | tunes/client/src/lib/graphql-mutations.ts:50 |
| query | CheckUsernameAvailability | usersPermissionsUsers | tunes/client/src/lib/graphql-mutations.ts:70 |

## Untagged GraphQL strings and templates

Dynamic templates may generate multiple category-specific documents. Counts are template sites.

| Kind | Name | Dynamic | Source |
|---|---|---|---|
| mutation | CreateFaq | false | tunes/client/src/lib/strapi-mutations.ts:72 |
| mutation | UpdateFaq | false | tunes/client/src/lib/strapi-mutations.ts:87 |
| mutation | DeleteFaq | false | tunes/client/src/lib/strapi-mutations.ts:102 |
| mutation | CreateSubscriptionPlanBase | false | tunes/client/src/lib/strapi-mutations.ts:117 |
| mutation | UpdateSubscriptionPlanBase | false | tunes/client/src/lib/strapi-mutations.ts:131 |
| mutation | DeleteSubscriptionPlanBase | false | tunes/client/src/lib/strapi-mutations.ts:145 |
| mutation | CreateAccount | false | tunes/client/src/lib/strapi-mutations.ts:159 |
| mutation | UpdateAccount | false | tunes/client/src/lib/strapi-mutations.ts:172 |
| mutation | DeleteAccount | false | tunes/client/src/lib/strapi-mutations.ts:185 |
| mutation | CreateUserSubscriptionPlan | false | tunes/client/src/lib/strapi-mutations.ts:198 |
| mutation | UpdateUserSubscriptionPlan | false | tunes/client/src/lib/strapi-mutations.ts:213 |
| mutation | DeleteUserSubscriptionPlan | false | tunes/client/src/lib/strapi-mutations.ts:228 |
| mutation | CreateSongLimit | false | tunes/client/src/lib/strapi-mutations.ts:243 |
| mutation | UpdateSongLimit | false | tunes/client/src/lib/strapi-mutations.ts:256 |
| mutation | DeleteSongLimit | false | tunes/client/src/lib/strapi-mutations.ts:269 |
| query | Faqs | false | tunes/client/src/lib/strapi-queries.ts:102 |
| query | SubscriptionPlanBases | false | tunes/client/src/lib/strapi-queries.ts:117 |
| query | UsersPermissionsUsers | false | tunes/client/src/lib/strapi-queries.ts:136 |
| query | Accounts | false | tunes/client/src/lib/strapi-queries.ts:147 |
| query | UserSubscriptionPlans | false | tunes/client/src/lib/strapi-queries.ts:160 |
| query | SongLimits | false | tunes/client/src/lib/strapi-queries.ts:175 |
| query | Me | false | tunes/client/src/pages/google-auth-redirect.tsx:19 |
| query | PublicCategory | true | tunes/server/publicProfile/strapiPublicProfileGateway.ts:151 |
| query | PublicGuideDocumentDetail | true | tunes/server/publicProfile/strapiPublicProfileGateway.ts:163 |
| query | PublicGuideHeaders | false | tunes/server/publicProfile/strapiPublicProfileGateway.ts:182 |
| query | Public | true | tunes/server/publicProfile/strapiPublicProfileGateway.ts:227 |
| query | PublicAccount | true | tunes/server/publicProfile/strapiPublicProfileGateway.ts:241 |
| query | PublicNavigationCounts | true | tunes/server/publicProfile/strapiPublicProfileGateway.ts:253 |
| query | PublicAccountsForSitemap | false | tunes/server/seo-routes.ts:128 |
| mutation | CreateExplorersAnalyticsEvent | false | tunes/server/services/explorers-analytics-adapters.ts:47 |
| query | ReadExplorersAnalyticsEvents | false | tunes/server/services/explorers-analytics-adapters.ts:55 |
| query | FindExplorersAnalyticsEvent | false | tunes/server/services/explorers-analytics-adapters.ts:81 |
| query | ValidatePublicAnalyticsTarget | true | tunes/server/services/explorers-analytics-adapters.ts:272 |
| query | Query | false | tunes/server/services/strapi-service.ts:128 |
| mutation | Mutation | false | tunes/server/services/strapi-service.ts:168 |
| mutation | UpdateSongLimit | false | tunes/server/services/strapi-service.ts:203 |
| query | MusicIdentityAbsence | false | tunes/server/services/strapiIdentityAbsenceProof.ts:52 |

## HTTP declarations

These require reachability classification in the architecture report; declaration is not evidence of deployment.

| Method | Path | Source |
|---|---|---|
| POST | /api/login | tunes/server/auth.ts:401 |
| POST | /api/register | tunes/server/auth.ts:492 |
| POST | /api/logout | tunes/server/auth.ts:671 |
| GET | /api/check | tunes/server/auth.ts:737 |
| GET | /api/csrf-token | tunes/server/auth.ts:746 |
| ALL | /api/auth | tunes/server/auth/canonicalApp.ts:61 |
| ALL | /api/auth/*splat | tunes/server/auth/canonicalApp.ts:62 |
| GET | /health/live | tunes/server/auth/canonicalApp.ts:65 |
| POST | /api/explorers/v1/recovery/start | tunes/server/auth/canonicalApp.ts:100 |
| GET | /api/explorers/v1/me | tunes/server/auth/canonicalApp.ts:118 |
| GET | env | tunes/server/config/music-startup.ts:123 |
| GET | /health/live | tunes/server/deployment/music-health.ts:43 |
| GET | /health/ready | tunes/server/deployment/music-health.ts:47 |
| GET | /api/music-entry/status | tunes/server/deployment/music-health.ts:70 |
| GET | /health/live | tunes/server/deployment/music-local-health.ts:32 |
| GET | /health/ready | tunes/server/deployment/music-local-health.ts:36 |
| GET | /api/music-entry/status | tunes/server/deployment/music-local-health.ts:72 |
| GET | env | tunes/server/index.ts:25 |
| GET | /health/live | tunes/server/publicProfile/localPublicProfileGatewayApp.ts:28 |
| PATCH | /api/explorers/v1/account | tunes/server/routes/explorersAccountRoutes.ts:11 |
| POST | /api/explorers/analytics/music-account/:accountDocumentId/events | tunes/server/routes/explorersAnalyticsRoutes.ts:191 |
| POST | /api/explorers/analytics/music/:publicSlug/events | tunes/server/routes/explorersAnalyticsRoutes.ts:228 |
| POST | /api/explorers/analytics/events | tunes/server/routes/explorersAnalyticsRoutes.ts:280 |
| GET | /api/explorers/analytics/events | tunes/server/routes/explorersAnalyticsRoutes.ts:328 |
| GET | /api/explorers/analytics/summary | tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts:29 |
| GET | /api/explorers/v1/catalog/games | tunes/server/routes/explorersCatalogRoutes.ts:12 |
| ALL | /api/explorers/v1/catalog/games | tunes/server/routes/explorersCatalogRoutes.ts:17 |
| GET | /api/explorers/v1/catalog/movie-genres | tunes/server/routes/explorersCatalogRoutes.ts:18 |
| ALL | /api/explorers/v1/catalog/movie-genres | tunes/server/routes/explorersCatalogRoutes.ts:19 |
| GET | /api/explorers/v1/catalog/books | tunes/server/routes/explorersCatalogRoutes.ts:20 |
| ALL | /api/explorers/v1/catalog/books | tunes/server/routes/explorersCatalogRoutes.ts:25 |
| GET | /api/explorers/v1/catalog/movies | tunes/server/routes/explorersCatalogRoutes.ts:26 |
| ALL | /api/explorers/v1/catalog/movies | tunes/server/routes/explorersCatalogRoutes.ts:27 |
| GET | /api/explorers/v1/account/lifecycle | tunes/server/routes/explorersLifecycleRoutes.ts:25 |
| POST | /api/explorers/v1/account/deletion-feedback | tunes/server/routes/explorersLifecycleRoutes.ts:29 |
| POST | /api/explorers/v1/account/deactivation | tunes/server/routes/explorersLifecycleRoutes.ts:35 |
| POST | /api/explorers/v1/account/deletion | tunes/server/routes/explorersLifecycleRoutes.ts:41 |
| GET | /api/explorers/v1/recovery/status | tunes/server/routes/explorersLifecycleRoutes.ts:56 |
| POST | /api/explorers/v1/recovery/complete | tunes/server/routes/explorersLifecycleRoutes.ts:86 |
| POST | /api/explorers/v1/media | tunes/server/routes/explorersMediaRoutes.ts:19 |
| DELETE | /api/explorers/v1/media/:id | tunes/server/routes/explorersMediaRoutes.ts:39 |
| GET | /api/explorers/v1/media/:id/content | tunes/server/routes/explorersMediaRoutes.ts:98 |
| POST | /api/explorers/v1/music/identity/ensure | tunes/server/routes/explorersMusicIdentityRoutes.ts:31 |
| GET | /api/explorers/v1/public/recommendations/search | tunes/server/routes/explorersPublicContentRoutes.ts:9 |
| ALL | /api/explorers/v1/public/recommendations/search | tunes/server/routes/explorersPublicContentRoutes.ts:19 |
| GET | /api/explorers/v1/public/handles/:handle/available | tunes/server/routes/explorersPublicContentRoutes.ts:24 |
| ALL | /api/explorers/v1/public/handles/:handle/available | tunes/server/routes/explorersPublicContentRoutes.ts:33 |
| GET | /api/explorers/v1/public/profiles/:username/collections/:category | tunes/server/routes/explorersPublicContentRoutes.ts:46 |
| GET | /api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations | tunes/server/routes/explorersPublicContentRoutes.ts:47 |
| GET | /api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations/:id | tunes/server/routes/explorersPublicContentRoutes.ts:48 |
| GET | /api/explorers/v1/profiles/:username | tunes/server/routes/explorersPublicProfileRoutes.ts:53 |
| GET | /api/explorers/v1/profiles/:username/recommendations/:category | tunes/server/routes/explorersPublicProfileRoutes.ts:67 |
| GET | /api/explorers/v1/profiles/:username/recommendations/movies/genres/:genreSlug | tunes/server/routes/explorersPublicProfileRoutes.ts:89 |
| GET | /api/explorers/v1/profiles/:username/recommendations/:category/:slug | tunes/server/routes/explorersPublicProfileRoutes.ts:94 |
| GET | /api/music/features | tunes/server/routes/musicFeatureRoutes.ts:13 |
| GET | /api/music-fixture/readiness | tunes/server/routes/musicFixtureProbe.ts:23 |
| POST | /api/music/identity/ensure | tunes/server/routes/musicIdentityRoutes.ts:83 |
| POST | /api/music/identity/lifecycle/prepare | tunes/server/routes/musicIdentityRoutes.ts:196 |
| GET | /api/music/identity/lifecycle/status | tunes/server/routes/musicIdentityRoutes.ts:197 |
| POST | /api/music/identity/lifecycle/boundary | tunes/server/routes/musicIdentityRoutes.ts:198 |
| POST | /api/music/identity/lifecycle/cancel | tunes/server/routes/musicIdentityRoutes.ts:199 |
| POST | /api/music/identity/lifecycle/suspend | tunes/server/routes/musicIdentityRoutes.ts:235 |
| POST | /api/music/identity/lifecycle/resume | tunes/server/routes/musicIdentityRoutes.ts:238 |
| GET | /api/music/identity/current | tunes/server/routes/musicIdentityRoutes.ts:244 |
| GET | /api-docs | tunes/server/routes/musicOpenApiRoutes.ts:810 |
| GET | /api/music/public-profile/:accountDocumentId | tunes/server/routes/musicSurfaceRoutes.ts:171 |
| GET | /api/music/public-resource/v1/:publicSlug | tunes/server/routes/musicSurfaceRoutes.ts:196 |
| GET | /api/playlists | tunes/server/routes/musicSurfaceRoutes.ts:219 |
| POST | /api/playlists | tunes/server/routes/musicSurfaceRoutes.ts:223 |
| GET | /api/playlists/:playlistId | tunes/server/routes/musicSurfaceRoutes.ts:239 |
| PATCH | /api/playlists/:playlistId | tunes/server/routes/musicSurfaceRoutes.ts:247 |
| DELETE | /api/playlists/:playlistId | tunes/server/routes/musicSurfaceRoutes.ts:259 |
| POST | /api/playlists/:playlistId/songs | tunes/server/routes/musicSurfaceRoutes.ts:266 |
| DELETE | /api/playlists/:playlistId/songs/:songId | tunes/server/routes/musicSurfaceRoutes.ts:282 |
| PATCH | /api/playlists/:playlistId/reorder | tunes/server/routes/musicSurfaceRoutes.ts:291 |
| PATCH | /api/playlists/:playlistId/visibility | tunes/server/routes/musicSurfaceRoutes.ts:302 |
| GET | /api/playlist/songs | tunes/server/routes/musicSurfaceRoutes.ts:313 |
| POST | /api/music/queue/replace | tunes/server/routes/musicSurfaceRoutes.ts:317 |
| POST | /api/music/socket-ticket | tunes/server/routes/musicSurfaceRoutes.ts:344 |
| GET | /api/music/dashboard | tunes/server/routes/musicSurfaceRoutes.ts:356 |
| POST | /api/music/queue/append | tunes/server/routes/musicSurfaceRoutes.ts:360 |
| PATCH | /api/music/guest-controls | tunes/server/routes/musicSurfaceRoutes.ts:385 |
| GET | /api/music/guest-controls | tunes/server/routes/musicSurfaceRoutes.ts:393 |
| POST | /api/playlist/songs | tunes/server/routes/musicSurfaceRoutes.ts:401 |
| POST | /api/playlist/currently-playing | tunes/server/routes/musicSurfaceRoutes.ts:409 |
| DELETE | /api/playlist/songs/bulk | tunes/server/routes/musicSurfaceRoutes.ts:444 |
| DELETE | /api/playlist/songs/:songId | tunes/server/routes/musicSurfaceRoutes.ts:453 |
| PATCH | /api/playlist/songs/:songId/position | tunes/server/routes/musicSurfaceRoutes.ts:460 |
| DELETE | /api/playlist/history | tunes/server/routes/musicSurfaceRoutes.ts:474 |
| DELETE | /api/playlist/history/:songId | tunes/server/routes/musicSurfaceRoutes.ts:478 |
| POST | /api/youtube/search | tunes/server/routes/musicSurfaceRoutes.ts:494 |
| POST | /api/youtube/video-from-url | tunes/server/routes/musicSurfaceRoutes.ts:506 |
| POST | /api/music/publication | tunes/server/routes/musicSurfaceRoutes.ts:518 |
| POST | /api/music/paid/import | tunes/server/routes/musicSurfaceRoutes.ts:552 |
| GET | /api/music/entitlement | tunes/server/routes/musicSurfaceRoutes.ts:562 |
| GET | /api/playlist/:guestUrl | tunes/server/routes/musicSurfaceRoutes.ts:578 |
| POST | /api/playlist/:guestUrl/youtube/search | tunes/server/routes/musicSurfaceRoutes.ts:600 |
| POST | /api/playlist/:guestUrl/youtube/video-from-url | tunes/server/routes/musicSurfaceRoutes.ts:614 |
| POST | /api/playlist/:guestUrl/requests | tunes/server/routes/musicSurfaceRoutes.ts:627 |
| ALL | /{*musicRetiredPath} | tunes/server/routes/musicSurfaceRoutes.ts:718 |
| POST | /api/user/request-reactivation | tunes/server/routes/reactivationRoutes.ts:134 |
| GET | /api/user/reactivate | tunes/server/routes/reactivationRoutes.ts:165 |
| GET | /robots.txt | tunes/server/seo-routes.ts:178 |
| GET | /sitemap.xml | tunes/server/seo-routes.ts:195 |
| GET | /api/explorers-sitemap.xml | tunes/server/seo-routes.ts:216 |

## Socket declarations

| Direction | Event | Source |
|---|---|---|
| on | connect | tunes/client/src/hooks/use-websocket.tsx:73 |
| on | disconnect | tunes/client/src/hooks/use-websocket.tsx:79 |
| on | connect_error | tunes/client/src/hooks/use-websocket.tsx:83 |
| emit | player_state | tunes/client/src/hooks/use-websocket.tsx:110 |
| emit | guest_request | tunes/client/src/hooks/use-websocket.tsx:112 |
| emit | music_error | tunes/server/socket/musicSocketServer.ts:167 |
| emit | music_public_change | tunes/server/socket/musicSocketServer.ts:182 |
| emit | music_owner_change | tunes/server/socket/musicSocketServer.ts:196 |
| emit | music_error | tunes/server/socket/musicSocketServer.ts:199 |
| emit | music_error | tunes/server/socket/musicSocketServer.ts:256 |
| on | connection | tunes/server/socket/musicSocketServer.ts:319 |
| emit | connection_status | tunes/server/socket/musicSocketServer.ts:347 |
| on | disconnect | tunes/server/socket/musicSocketServer.ts:348 |
| emit | music_error | tunes/server/socket/musicSocketServer.ts:352 |
| on | player_state | tunes/server/socket/musicSocketServer.ts:373 |
| on | guest_request | tunes/server/socket/musicSocketServer.ts:386 |
| emit | guest_request_status | tunes/server/socket/musicSocketServer.ts:398 |
| emit | music_error | tunes/server/socket/musicSocketServer.ts:403 |

## Files with coupling signals

| File | Signals |
|---|---|
| explorers-earth/src/components/AuthSyncManager.tsx | DOCUMENT_ID |
| explorers-earth/src/components/CircularPlacesModal.tsx | DOCUMENT_ID |
| explorers-earth/src/components/ProfileSetupAccordion.tsx | STRAPI_REFERENCE, UPLOAD |
| explorers-earth/src/components/PublicNav.tsx | STRAPI_REFERENCE |
| explorers-earth/src/components/ui/Carousel.tsx | DOCUMENT_ID |
| explorers-earth/src/components/ui/Dropdown.tsx | DOCUMENT_ID |
| explorers-earth/src/content/reference/index.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/Analytics/api/queries.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/Analytics/components/charts/LocationEngagementChart.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Analytics/components/charts/RecommendedPlacesChart.tsx | DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/api/appsClient.ts | STRAPI_REFERENCE, UPLOAD |
| explorers-earth/src/features/AppsAndTools/api/appsViewModel.ts | DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/api/mutation.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/api/query.ts | GRAPHQL, STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/components/dashboard/AddAppPage.tsx | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/components/dashboard/AppListView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/components/dashboard/AppTopPicksManager.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/components/dashboard/AppsHome.tsx | DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/components/public/AppCarouselRow.tsx | DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/components/public/AppTopPicksHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/components/public/AppTopPicksMobileHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/components/public/PublicAppList.tsx | DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/components/public/PublicApps.tsx | DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/hooks/useAppsOwner.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/types/index.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/AppsAndTools/utils/appHelpers.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Authentication/api/mutation.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Authentication/api/queries.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Authentication/api/userQueries.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Authentication/components/PlaceProfileCard.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Authentication/hooks/useCurrentUser.ts | DOCUMENT_ID |
| explorers-earth/src/features/Books/api/booksViewModel.ts | DOCUMENT_ID |
| explorers-earth/src/features/Books/api/mutation.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Books/api/publicBooksContinuation.ts | DOCUMENT_ID |
| explorers-earth/src/features/Books/api/query.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Books/api/useBookListCommands.ts | DOCUMENT_ID |
| explorers-earth/src/features/Books/api/useBooksOwnerContent.ts | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/dashboard/AddBookPage.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/dashboard/BookListView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/dashboard/BooksHome.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/dashboard/TopReadsManager.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/public/BookCarouselRow.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/public/BookDetailModal.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/public/PublicBookList.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/public/PublicBookSubject.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/public/PublicBooks.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/public/TopReadsHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/components/public/TopReadsMobileHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Books/types/index.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Books/utils/bookHelpers.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/api/mutation.ts | GRAPHQL, STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/api/placesCommands.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/Favorites/api/placesViewModel.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/api/query.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/components/AddLinkedPeoplePage.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/components/AddLinkedProductsPage.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/components/AddPlaceOverlay.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Favorites/components/AddRecommendation.tsx | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/components/LinksAndQR.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Favorites/components/RecommendForm.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Favorites/components/Recommendations.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/components/TopPlacesByCategory.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Favorites/hooks/useAddRecommendation.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/hooks/useCreateLocation.ts | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/hooks/useMenuItems.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/hooks/usePlacesOwner.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Favorites/hooks/useRecommedationFields.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/Favorites/services/claimablePlaceProfileService.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Games/api/gamesViewModel.ts | DOCUMENT_ID |
| explorers-earth/src/features/Games/api/mutation.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Games/api/query.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Games/components/dashboard/AddGamePage.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Games/components/dashboard/GameListView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Games/components/dashboard/GamesHome.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Games/components/dashboard/TopGamesManager.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Games/components/public/GameCarouselRow.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Games/components/public/PublicGames.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Games/components/public/PublicGamesGenre.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Games/components/public/PublicGamesList.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Games/components/public/TopGamesHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Games/components/public/TopGamesMobileHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Games/hooks/useGamesOwner.ts | DOCUMENT_ID |
| explorers-earth/src/features/Games/types/index.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Games/utils/gameHelpers.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Guides/GuidesPage.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Guides/api/guideCreation.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/Guides/api/guidesClient.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/Guides/api/guidesViewModel.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Guides/api/mutations.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Guides/api/queries.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/CreateGuidePage.tsx | STRAPI_REFERENCE, UPLOAD |
| explorers-earth/src/features/Guides/components/CreateGuideStep2.tsx | STRAPI_REFERENCE |
| explorers-earth/src/features/Guides/components/GuideCard.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/GuideDetails/BudgetTable.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/GuideDetails/BudgetTimeline.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/GuideDetails/EditGeneralTipsModal.tsx | STRAPI_REFERENCE |
| explorers-earth/src/features/Guides/components/GuideDetails/ItineraryView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/GuideDetails/SectionCard.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/GuideDetails/SectionFormModal.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/GuideDetails/StayTimeline.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/GuideDetails/TipsTimeline.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/GuideDetails/TransportationTimeline.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/GuideSectionForm.tsx | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/Shared/DescriptionRenderer.tsx | STRAPI_REFERENCE |
| explorers-earth/src/features/Guides/components/TopPicksHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/components/TopPicksMobileHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/context/GuideEditingProvider.tsx | STRAPI_REFERENCE |
| explorers-earth/src/features/Guides/hooks/useGuidesOwner.ts | DOCUMENT_ID |
| explorers-earth/src/features/Guides/pages/GuideDetailsPage.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Guides/pages/GuideSectionFormPage.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Guides/services/activityPhotoService.ts | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/features/Guides/services/aiSectionGenerationService.ts | STRAPI_REFERENCE, UPLOAD |
| explorers-earth/src/features/Guides/types/guideSectionTypes.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Guides/types/index.ts | DOCUMENT_ID |
| explorers-earth/src/features/LandingPage/hooks/useFaqs.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/LandingPage/hooks/usePlatformTerms.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/LandingPage/hooks/useReferenceContent.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/Movies/api/explorersAdapter.ts | DOCUMENT_ID |
| explorers-earth/src/features/Movies/api/moviesViewModel.ts | DOCUMENT_ID |
| explorers-earth/src/features/Movies/api/mutation.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Movies/api/publicMoviesContinuation.ts | DOCUMENT_ID |
| explorers-earth/src/features/Movies/api/query.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Movies/api/usePublicMovieGenre.ts | DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/dashboard/AddMoviePage.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/dashboard/MovieListView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/dashboard/MoviesHome.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/dashboard/TopPicksManager.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/public/MovieCarouselRow.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/public/MovieDetailModal.tsx | STRAPI_REFERENCE |
| explorers-earth/src/features/Movies/components/public/PublicMovieGenre.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/public/PublicMovieList.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/public/PublicMovies.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/public/TopPicksHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Movies/components/public/TopPicksMobileHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Movies/types/index.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Movies/utils/movieHelpers.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/People/api/mutation.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/People/api/peopleClient.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/People/api/peopleViewModel.ts | DOCUMENT_ID |
| explorers-earth/src/features/People/api/query.ts | GRAPHQL, STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/People/components/dashboard/AddPersonPage.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/People/components/dashboard/PeopleHome.tsx | DOCUMENT_ID |
| explorers-earth/src/features/People/components/dashboard/PersonListView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/People/components/dashboard/PersonTopPicksManager.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/People/components/public/PersonCarouselRow.tsx | DOCUMENT_ID |
| explorers-earth/src/features/People/components/public/PersonTopPicksHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/People/components/public/PersonTopPicksMobileHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/People/components/public/PublicPeople.tsx | DOCUMENT_ID |
| explorers-earth/src/features/People/components/public/PublicPersonList.tsx | DOCUMENT_ID |
| explorers-earth/src/features/People/components/public/PublicPersonSector.tsx | DOCUMENT_ID |
| explorers-earth/src/features/People/hooks/usePeopleOwner.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/People/types/index.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/People/utils/personHelpers.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Products/api/mutation.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Products/api/productsClient.ts | STRAPI_REFERENCE |
| explorers-earth/src/features/Products/api/productsViewModel.ts | DOCUMENT_ID |
| explorers-earth/src/features/Products/api/query.ts | GRAPHQL, STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Products/components/dashboard/AddProductPage.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Products/components/dashboard/ProductListView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Products/components/dashboard/ProductTopPicksManager.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Products/components/dashboard/ProductsHome.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Products/components/public/ProductCarouselRow.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Products/components/public/ProductTopPicksHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Products/components/public/ProductTopPicksMobileHero.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Products/components/public/PublicProductList.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Products/components/public/PublicProducts.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Products/hooks/useProductsOwner.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Products/types/index.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Products/utils/productHelpers.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Profile/api/UserStatus.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Profile/api/profileClient.ts | DOCUMENT_ID |
| explorers-earth/src/features/Profile/components/FeedFields.tsx | UPLOAD, DOCUMENT_ID |
| explorers-earth/src/features/Profile/components/ProfileForm.tsx | DOCUMENT_ID |
| explorers-earth/src/features/Profile/config/profileInitialValues.ts | DOCUMENT_ID |
| explorers-earth/src/features/Profile/hooks/useUpdateProfile.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/api/publicProfilePagination.ts | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/api/query.ts | GRAPHQL, STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/MapView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PlaceMapView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/ProfileRecommendationsTab.tsx | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicGuideDetailPage.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicGuideViews/DayNavigationView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicGuideViews/PublicGuideJourneyView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicGuideViews/PublicGuideStayView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicGuideViews/PublicGuideTipsView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicGuideViews/PublicGuideTransportView.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicGuides.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicHome.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicProfile.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/PublicProfileThemeProvider.tsx | DOCUMENT_ID |
| explorers-earth/src/features/PublicHome/components/publicPlaceMedia.ts | STRAPI_REFERENCE, UPLOAD |
| explorers-earth/src/features/PublicHome/utils/publicProfileContent.ts | DOCUMENT_ID |
| explorers-earth/src/features/Settings/Settings.tsx | STRAPI_REFERENCE |
| explorers-earth/src/features/Settings/api/mutation.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/features/Settings/components/BillingTab.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/features/Settings/components/ProfileAccountSettings.tsx | DOCUMENT_ID |
| explorers-earth/src/features/music/MusicPublishProvider.tsx | STRAPI_REFERENCE |
| explorers-earth/src/features/music/PublicMusicAvailabilityProvider.tsx | DOCUMENT_ID |
| explorers-earth/src/features/music/musicIdentityCoordinator.ts | DOCUMENT_ID |
| explorers-earth/src/features/navigation/CategoryNavigationProvider.tsx | STRAPI_REFERENCE |
| explorers-earth/src/features/navigation/categoryNavigationApi.ts | GRAPHQL, DOCUMENT_ID |
| explorers-earth/src/hooks/useAIGuideQuota.ts | DOCUMENT_ID |
| explorers-earth/src/hooks/useMediaViewer.ts | DOCUMENT_ID |
| explorers-earth/src/lib/apolloCache.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/lib/localTunesApiClient.ts | STRAPI_REFERENCE |
| explorers-earth/src/main.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/pages/Checkout.tsx | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/pages/ClaimAccount.tsx | STRAPI_REFERENCE, UPLOAD |
| explorers-earth/src/pages/EmailVerification.tsx | STRAPI_REFERENCE |
| explorers-earth/src/pages/Favorites.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/pages/ForgotPassword.tsx | STRAPI_REFERENCE |
| explorers-earth/src/pages/Home.tsx | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/pages/Music.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/pages/OnBoarding.tsx | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/pages/Profile.tsx | STRAPI_REFERENCE, UPLOAD, DOCUMENT_ID |
| explorers-earth/src/pages/RecommendationsHub.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/pages/Register.tsx | STRAPI_REFERENCE |
| explorers-earth/src/pages/ResetLinkSent.tsx | STRAPI_REFERENCE |
| explorers-earth/src/pages/ResetPassword.tsx | STRAPI_REFERENCE |
| explorers-earth/src/pages/SubscriptionPlans.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/pages/public/ProfileMusic.tsx | DOCUMENT_ID |
| explorers-earth/src/services/aiGuideService.ts | STRAPI_REFERENCE |
| explorers-earth/src/services/explorersAnalyticsClient.ts | DOCUMENT_ID |
| explorers-earth/src/services/geminiService.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/services/googleBooksService.ts | STRAPI_REFERENCE |
| explorers-earth/src/services/igdbService.ts | UPLOAD |
| explorers-earth/src/services/paymentService.ts | STRAPI_REFERENCE |
| explorers-earth/src/services/requestTrackingService.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/services/subscriptionService.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| explorers-earth/src/services/useAccountLifecycleIdentity.ts | DOCUMENT_ID |
| explorers-earth/src/store/store.ts | DOCUMENT_ID |
| explorers-earth/src/store/useCityStore.ts | DOCUMENT_ID |
| explorers-earth/src/utils/categoryMapper.ts | DOCUMENT_ID |
| explorers-earth/src/utils/fileValidation.ts | STRAPI_REFERENCE |
| explorers-earth/src/utils/publicGuideSlug.ts | DOCUMENT_ID |
| explorers-earth/src/utils/rating.ts | STRAPI_REFERENCE |
| explorers-earth/src/utils/strapiBlocksConverter.ts | STRAPI_REFERENCE |
| explorers-earth/src/utils/uploadPathGenerator.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/client/src/components/new-header.tsx | STRAPI_REFERENCE |
| tunes/client/src/components/search-songs.tsx | STRAPI_REFERENCE |
| tunes/client/src/hooks/use-auth-compat.tsx | STRAPI_REFERENCE |
| tunes/client/src/hooks/use-auth.tsx | STRAPI_REFERENCE |
| tunes/client/src/hooks/use-neon-user.ts | STRAPI_REFERENCE |
| tunes/client/src/hooks/use-strapi-auth.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/client/src/lib/apollo-client.ts | STRAPI_REFERENCE |
| tunes/client/src/lib/csrf.ts | UPLOAD |
| tunes/client/src/lib/google-auth.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/client/src/lib/graphql-mutations.ts | GRAPHQL, STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/client/src/lib/queryClient.ts | STRAPI_REFERENCE |
| tunes/client/src/lib/strapi-client.ts | STRAPI_REFERENCE |
| tunes/client/src/lib/strapi-mutations.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/client/src/lib/strapi-queries.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/client/src/pages/admin/tabs/ApiTokensTab.tsx | UPLOAD |
| tunes/client/src/pages/admin/tabs/EmailTab.tsx | UPLOAD |
| tunes/client/src/pages/admin/tabs/SystemTab.tsx | UPLOAD |
| tunes/client/src/pages/admin/tabs/TeamTab.tsx | UPLOAD |
| tunes/client/src/pages/dashboard-page.tsx | STRAPI_REFERENCE |
| tunes/client/src/pages/google-auth-redirect.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/client/src/pages/google-callback-page.tsx | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/client/src/pages/new-auth-page.tsx | STRAPI_REFERENCE |
| tunes/client/src/pages/playlist-page.tsx | STRAPI_REFERENCE |
| tunes/client/src/pages/tabs/ApiTokensTab.tsx | UPLOAD |
| tunes/client/src/pages/tabs/EmailTab.tsx | UPLOAD |
| tunes/client/src/pages/tabs/SystemTab.tsx | UPLOAD |
| tunes/client/src/pages/tabs/TeamTab.tsx | UPLOAD |
| tunes/client/src/pages/user-detail-page.tsx | UPLOAD |
| tunes/client/src/stores/authStore.ts | DOCUMENT_ID |
| tunes/client/src/types/env.d.ts | STRAPI_REFERENCE |
| tunes/server/app.ts | STRAPI_REFERENCE |
| tunes/server/application/accountLifecycleMaintenance.ts | STRAPI_REFERENCE |
| tunes/server/application/bookCoverImport.ts | UPLOAD |
| tunes/server/application/discovery.ts | DOCUMENT_ID |
| tunes/server/application/guides.ts | STRAPI_REFERENCE |
| tunes/server/auth.ts | STRAPI_REFERENCE |
| tunes/server/config/local-public-profile-gateway.ts | STRAPI_REFERENCE |
| tunes/server/config/music-environment.ts | STRAPI_REFERENCE |
| tunes/server/config/music-identity-config.ts | STRAPI_REFERENCE |
| tunes/server/config/music-local-profile.ts | STRAPI_REFERENCE |
| tunes/server/config/music-reconciliation-config.ts | STRAPI_REFERENCE |
| tunes/server/jwt-auth-middleware.ts | STRAPI_REFERENCE |
| tunes/server/middleware/musicPrincipal.ts | STRAPI_REFERENCE |
| tunes/server/music/accountMusicRepository.ts | STRAPI_REFERENCE |
| tunes/server/policies/musicRetirementPolicy.ts | STRAPI_REFERENCE |
| tunes/server/policies/musicSurfacePolicy.ts | STRAPI_REFERENCE |
| tunes/server/publicProfile/postgresPublicProfileGateway.ts | DOCUMENT_ID |
| tunes/server/publicProfile/publicAppsProjection.ts | DOCUMENT_ID |
| tunes/server/publicProfile/publicBooksProjection.ts | DOCUMENT_ID |
| tunes/server/publicProfile/publicGuidesProjection.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/publicProfile/publicMoviesProjection.ts | DOCUMENT_ID |
| tunes/server/publicProfile/publicPeopleProjection.ts | DOCUMENT_ID |
| tunes/server/publicProfile/publicPlacesProjection.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/publicProfile/publicProductsProjection.ts | DOCUMENT_ID |
| tunes/server/publicProfile/publicProfileContract.ts | STRAPI_REFERENCE |
| tunes/server/publicProfile/publicProfileService.ts | DOCUMENT_ID |
| tunes/server/publicProfile/strapiPublicProfileGateway.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/repositories/explorersAnalyticsEventRepository.ts | STRAPI_REFERENCE |
| tunes/server/repositories/guideRepository.ts | STRAPI_REFERENCE |
| tunes/server/repositories/musicDomainRepository.ts | STRAPI_REFERENCE |
| tunes/server/repositories/musicIdentityRepository.ts | STRAPI_REFERENCE |
| tunes/server/repositories/reconciliationRepository.ts | STRAPI_REFERENCE |
| tunes/server/routes/explorersAnalyticsRoutes.ts | DOCUMENT_ID |
| tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/routes/explorersMusicIdentityRoutes.ts | STRAPI_REFERENCE |
| tunes/server/routes/index.ts | STRAPI_REFERENCE |
| tunes/server/routes/musicFixtureProbe.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/routes/musicIdentityRoutes.ts | STRAPI_REFERENCE |
| tunes/server/routes/musicOpenApiRoutes.ts | STRAPI_REFERENCE |
| tunes/server/routes/musicSurfaceRoutes.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/routes/reactivationRoutes.ts | STRAPI_REFERENCE |
| tunes/server/routes/strapiRoutes.ts | STRAPI_REFERENCE |
| tunes/server/security-containment.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/seo-routes.ts | STRAPI_REFERENCE |
| tunes/server/services/explorers-analytics-adapters.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/services/explorers-analytics-composition.ts | STRAPI_REFERENCE |
| tunes/server/services/explorers-analytics-receipts.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/services/explorers-analytics-service.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/services/musicLifecycleService.ts | STRAPI_REFERENCE |
| tunes/server/services/musicProjectionService.ts | STRAPI_REFERENCE |
| tunes/server/services/musicReconciler.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/services/musicReconciliationSuspensionListener.ts | STRAPI_REFERENCE |
| tunes/server/services/musicTokenService.ts | STRAPI_REFERENCE |
| tunes/server/services/reactivation-service.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/services/strapi-service.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/services/strapiIdentityAbsenceProof.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/services/strapiIdentityGateway.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/server/services/youtubeReadService.ts | STRAPI_REFERENCE |
| tunes/server/startup/explorers-analytics-migration.ts | STRAPI_REFERENCE |
| tunes/server/storage.ts | STRAPI_REFERENCE |
| tunes/shared/explorersGuideContract.ts | STRAPI_REFERENCE, DOCUMENT_ID |
| tunes/shared/explorersPlaceLinkContract.ts | DOCUMENT_ID |
| tunes/shared/musicError.ts | STRAPI_REFERENCE |
| tunes/shared/schema.ts | STRAPI_REFERENCE |

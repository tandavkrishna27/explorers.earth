# Verified Strapi schema inventory

Repository MeteoriteLabs/localqr-strapi-v2, commit `50b6c6e180de4a1290b0c0a3c8450ac5947566d5`. Schema definitions, not deployed database rows or administrator role settings.

## Account

Source: [src/api/account/content-types/account/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/account/content-types/account/schema.json). Draft/publish: false. Localized: true.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| username | string | false |  |  |
| Account_Name | string | false |  |  |
| Bio_1 | string | false |  |  |
| users_permissions_users | relation / manyToMany | false |  | plugin::users-permissions.user; inversedBy accounts |
| Addresss | json | false |  |  |
| Account_Type | enumeration | false |  | Personal, Creator, Business |
| profile_picture | media | false |  |  |
| bg_picture | media | false |  |  |
| social_media | json | false |  |  |
| primary_admin | relation / oneToOne | false |  | plugin::users-permissions.user |
| all_admins | relation / oneToMany | false |  | plugin::users-permissions.user |
| mobile_number_visibility | boolean | false |  |  |
| profile_place_details | json | false |  |  |
| profile_place_media_details | json | false |  |  |
| recommendation_lists | relation / oneToMany | false |  | api::recommendation-list.recommendation-list; mappedBy account |
| mobile_number | string | false |  |  |
| Primary_Address | json | true |  |  |
| Bio | richtext | false |  |  |
| community_boards | relation / oneToMany | false |  | api::community.community; mappedBy account |
| guides | relation / oneToMany | false |  | api::guide.guide; mappedBy account |
| Public_Profile_Address | json | false |  |  |
| Feed_Data | json | false |  |  |
| claimable_place_profile | relation / oneToOne | false |  | api::claimable-place-profile.claimable-place-profile; mappedBy Claiming_Account |
| Is_Claimable | boolean | false | false |  |
| localtunes_integrated | enumeration | true | "No" | Yes, No |
| public_recommendations | enumeration | false | "No" | Yes, No |
| public_profile | enumeration | false | "Yes" | Yes, No |
| public_music | enumeration | false | "No" | Yes, No |
| localtunes_public | string | false |  |  |
| public_guides | enumeration | false | "No" | Yes, No |
| movie_lists | relation / oneToMany | false |  | api::movie-list.movie-list; mappedBy account |
| public_movie | enumeration | false | "No" | Yes, No |
| book_lists | relation / oneToMany | false |  | api::book-list.book-list; mappedBy account |
| public_books | enumeration | false | "No" | Yes, No |
| game_lists | relation / oneToMany | false |  | api::game-list.game-list; mappedBy account |
| public_games | enumeration | false | "No" | Yes, No |
| pinned_nav_tabs | json | false |  |  |
| app_lists | relation / oneToMany | false |  | api::app-list.app-list; mappedBy account |
| product_lists | relation / oneToMany | false |  | api::product-list.product-list; mappedBy account |
| public_apps | enumeration | false | "No" | Yes, No |
| public_products | enumeration | false | "No" | Yes, No |
| person_lists | relation / oneToMany | false |  | api::person-list.person-list; mappedBy account |
| public_people | enumeration | false | "No" | Yes, No |
| auto_pinning | boolean | false | true |  |

## App_Category

Source: [src/api/app-category/content-types/app-category/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/app-category/content-types/app-category/schema.json). Draft/publish: true. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| recommended_apps | relation / oneToMany | false |  | api::recommended-app.recommended-app; mappedBy app_category |
| name | string | true |  |  |
| slug | string | true |  |  |

## AppList

Source: [src/api/app-list/content-types/app-list/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/app-list/content-types/app-list/schema.json). Draft/publish: true. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| List_Name | string | true |  |  |
| list_description | text | false |  |  |
| slug | string | true |  |  |
| Visibility | boolean | true | false |  |
| cover_image | media | false |  |  |
| display_order | integer | false | 0 |  |
| top_apps_heading | string | false |  |  |
| account | relation / manyToOne | false |  | api::account.account; inversedBy app_lists |
| recommended_apps | relation / oneToMany | false |  | api::recommended-app.recommended-app; mappedBy app_list |

## Book_Category

Source: [src/api/book-category/content-types/book-category/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/book-category/content-types/book-category/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| subject_name | string | true |  |  |
| recommended_books | relation / manyToMany | false |  | api::recommended-book.recommended-book; inversedBy book_categories |
| description | string | false |  |  |

## BookList

Source: [src/api/book-list/content-types/book-list/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/book-list/content-types/book-list/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| List_Name | string | true |  |  |
| list_description | text | false |  |  |
| slug | string | true |  |  |
| visibility | boolean | true | false |  |
| cover_image | media | false |  |  |
| display_order | integer | false |  |  |
| top_reads_heading | string | false |  |  |
| account | relation / manyToOne | false |  | api::account.account; inversedBy book_lists |
| recommended_books | relation / oneToMany | false |  | api::recommended-book.recommended-book; mappedBy book_list |

## Claimable_Place_Profile

Source: [src/api/claimable-place-profile/content-types/claimable-place-profile/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/claimable-place-profile/content-types/claimable-place-profile/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Place_Id | uid | false |  |  |
| Name | string | false |  |  |
| Address | string | false |  |  |
| Lat | decimal | false |  |  |
| Long | decimal | false |  |  |
| Phone | string | false |  |  |
| Website | string | false |  |  |
| Meta_Data | json | false |  |  |
| Recommendation_Count | integer | false |  |  |
| Is_Claimed | boolean | false | false |  |
| Claiming_Account | relation / oneToOne | false |  | api::account.account; inversedBy claimable_place_profile |
| Added_By_User | json | false |  |  |

## Community

Source: [src/api/community/content-types/community/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/community/content-types/community/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| description | richtext | false |  |  |
| Title | string | false |  |  |
| media_details | json | false |  |  |
| Media | media | false |  |  |
| visibility | boolean | false | true |  |
| account | relation / manyToOne | false |  | api::account.account; inversedBy community_boards |

## FAQ

Source: [src/api/faq/content-types/faq/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/faq/content-types/faq/schema.json). Draft/publish: false. Localized: true.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Question | text | false |  |  |
| Answer | text | false |  |  |
| Sequence | integer | false |  |  |

## Follower

Source: [src/api/follower/content-types/follower/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/follower/content-types/follower/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| main_account | string | false |  |  |
| follower_account | string | false |  |  |

## Game_Category

Source: [src/api/game-category/content-types/game-category/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/game-category/content-types/game-category/schema.json). Draft/publish: true. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| genre_name | string | true |  |  |
| igdb_genre_id | integer | false |  |  |
| recommended_games | relation / manyToMany | false |  | api::recommended-game.recommended-game; inversedBy game_categories |

## GameList

Source: [src/api/game-list/content-types/game-list/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/game-list/content-types/game-list/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| List_Name | string | true |  |  |
| list_description | text | false |  |  |
| slug | string | true |  |  |
| Visibility | boolean | true | false |  |
| cover_image | media | false |  |  |
| display_order | integer | false |  |  |
| top_picks_heading | string | false |  |  |
| account | relation / manyToOne | false |  | api::account.account; inversedBy game_lists |
| recommended_games | relation / oneToMany | false |  | api::recommended-game.recommended-game; mappedBy game_list |

## Guide_Category

Source: [src/api/guide-category/content-types/guide-category/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/guide-category/content-types/guide-category/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Category_Name | string | false |  |  |

## Guide_Section

Source: [src/api/guide-section/content-types/guide-section/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/guide-section/content-types/guide-section/schema.json). Draft/publish: true. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Title | string | false |  |  |
| Sequence | decimal | false |  |  |
| Description | blocks | false |  |  |
| Recommendation_Activity | json | false |  |  |
| guide | relation / manyToOne | false |  | api::guide.guide; inversedBy guide_sections |
| Recomendation_Media | media | false |  |  |
| Map_Details | json | false |  |  |
| Packing_List | json | false |  |  |
| Pre_Tasks | json | false |  |  |
| Section_tags | json | false |  |  |
| Timeline | json | false |  |  |
| Transport | json | false |  |  |
| Stay | json | false |  |  |
| Budget | json | false |  |  |

## Guide

Source: [src/api/guide/content-types/guide/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/guide/content-types/guide/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Title | string | false |  |  |
| Description | blocks | false |  |  |
| Tips_Notes | blocks | false |  |  |
| Visibility | boolean | false |  |  |
| account | relation / manyToOne | false |  | api::account.account; inversedBy guides |
| Estimated_Budget | json | false |  |  |
| Guide_Section_Details | json | false |  |  |
| guide_sections | relation / oneToMany | false |  | api::guide-section.guide-section; mappedBy guide |
| Guide_Media | media | false |  |  |
| slug | string | false |  |  |
| Guide_Type | enumeration | false |  | Itinerary, Theme |
| Guide_Tags | json | false |  |  |
| Place_Details | json | false |  |  |
| Transportation | json | false |  |  |
| Number_Of_Days | integer | false |  |  |
| Category | json | false |  |  |
| Best_Time_To_Visit | json | false |  |  |
| Budget_Type | enumeration | false |  | Budget, Mid-Range, Luxury, Backpacker, Ultra-Luxury |
| is_Multicity | boolean | false | false |  |
| is_pinned | boolean | false |  |  |
| pin_order | integer | false |  |  |
| display_order | integer | false |  |  |

## Movie_Category

Source: [src/api/movie-category/content-types/movie-category/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/movie-category/content-types/movie-category/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| genre_name | string | true |  |  |
| recommended_movie | relation / manyToOne | false |  | api::recommended-movie.recommended-movie; inversedBy movie_categories |

## MovieList

Source: [src/api/movie-list/content-types/movie-list/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/movie-list/content-types/movie-list/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| List_Name | string | true |  |  |
| list_description | text | false |  |  |
| slug | uid | true |  |  |
| Visibility | boolean | true | false |  |
| cover_image | media | false |  |  |
| display_order | integer | false | 0 |  |
| top_picks_heading | string | false | "Top Picks" |  |
| account | relation / manyToOne | false |  | api::account.account; inversedBy movie_lists |
| recommended_movies | relation / oneToMany | false |  | api::recommended-movie.recommended-movie; mappedBy movie_list |

## People_Category

Source: [src/api/people-category/content-types/people-category/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/people-category/content-types/people-category/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Category_name | string | false |  |  |
| recommended_people | relation / oneToMany | false |  | api::recommended-person.recommended-person; mappedBy people_category |

## PersonList

Source: [src/api/person-list/content-types/person-list/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/person-list/content-types/person-list/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| List_Name | string | true |  |  |
| list_description | text | false |  |  |
| slug | string | true |  |  |
| Visibility | boolean | true | false |  |
| cover_image | media | false |  |  |
| display_order | integer | false | 0 |  |
| top_picks_heading | string | false |  |  |
| account | relation / manyToOne | false |  | api::account.account; inversedBy person_lists |
| recommended_people | relation / oneToMany | false |  | api::recommended-person.recommended-person; mappedBy person_list |
| recommendation_list | relation / manyToOne | false |  | api::recommendation-list.recommendation-list; inversedBy person_lists |

## Platform_Term

Source: [src/api/platform-term/content-types/platform-term/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/platform-term/content-types/platform-term/schema.json). Draft/publish: false. Localized: true.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Terms_and_Condition | blocks | false |  |  |
| Privacy_and_Policy | blocks | false |  |  |
| Cookie_Policy | blocks | false |  |  |

## Product_Category

Source: [src/api/product-category/content-types/product-category/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/product-category/content-types/product-category/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| recommended_products | relation / oneToMany | false |  | api::recommended-product.recommended-product; mappedBy product_category |
| name | string | true |  |  |
| slug | string | true |  |  |

## ProductList

Source: [src/api/product-list/content-types/product-list/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/product-list/content-types/product-list/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| List_Name | string | true |  |  |
| slug | string | true |  |  |
| Visibility | boolean | true | false |  |
| cover_image | media | false |  |  |
| display_order | integer | false | 0 |  |
| top_products_heading | string | false |  |  |
| account | relation / manyToOne | false |  | api::account.account; inversedBy product_lists |
| recommended_products | relation / oneToMany | false |  | api::recommended-product.recommended-product; mappedBy product_list |
| list_description | text | false |  |  |
| recommendation_list | relation / manyToOne | false |  | api::recommendation-list.recommendation-list; inversedBy product_lists |

## Public_Page_Analytic

Source: [src/api/public-page-analytic/content-types/public-page-analytic/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/public-page-analytic/content-types/public-page-analytic/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Account_Id | string | true |  |  |
| Location_Id | string | false |  |  |
| Recommendation_Id | string | false |  |  |
| Stats | json | false |  |  |

## Reason_For_Leaving

Source: [src/api/reason-for-leaving/content-types/reason-for-leaving/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/reason-for-leaving/content-types/reason-for-leaving/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Reasons | json | false |  |  |
| User_Details | json | false |  |  |

## Recommendation_Category

Source: [src/api/recommendation-category/content-types/recommendation-category/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommendation-category/content-types/recommendation-category/schema.json). Draft/publish: false. Localized: true.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Category_Name | string | false |  |  |
| recommendation_sub_categories | relation / oneToMany | false |  | api::recommendation-sub-category.recommendation-sub-category; mappedBy recommendation_category |

## Recommendation_List

Source: [src/api/recommendation-list/content-types/recommendation-list/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommendation-list/content-types/recommendation-list/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| slug | string | false |  |  |
| List_Name | string | false |  |  |
| Instagram_Media_URL | string | false |  |  |
| account | relation / manyToOne | false |  | api::account.account; inversedBy recommendation_lists |
| Visibility | boolean | false |  |  |
| List_Name_Details | json | false |  |  |
| Sequence | integer | false |  |  |
| recommended_places | relation / oneToMany | false |  | api::recommended-place.recommended-place; mappedBy recommendation_list |
| is_pinned | boolean | false |  |  |
| pin_order | integer | false |  |  |
| display_order | integer | false |  |  |
| person_lists | relation / oneToMany | false |  | api::person-list.person-list; mappedBy recommendation_list |
| product_lists | relation / oneToMany | false |  | api::product-list.product-list; mappedBy recommendation_list |

## Recommendation_Sub_Category

Source: [src/api/recommendation-sub-category/content-types/recommendation-sub-category/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommendation-sub-category/content-types/recommendation-sub-category/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| sub_category | string | false |  |  |
| recommendation_category | relation / manyToOne | false |  | api::recommendation-category.recommendation-category; inversedBy recommendation_sub_categories |

## RecommendedApp

Source: [src/api/recommended-app/content-types/recommended-app/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommended-app/content-types/recommended-app/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| app_url | string | true |  |  |
| title | string | true |  |  |
| description | text | false |  |  |
| logo_url | string | false |  |  |
| developer | string | false |  |  |
| platforms | json | false |  |  |
| price_tier | enumeration | true | "Freemium" | Free, Freemium, Paid, Subscription |
| download_url | string | false |  |  |
| user_recommendation_note | blocks | false |  |  |
| user_rating | integer | false |  |  |
| is_pinned | boolean | false | false |  |
| pin_order | integer | false |  |  |
| display_order | integer | false | 0 |  |
| screenshots | json | false |  |  |
| app_list | relation / manyToOne | false |  | api::app-list.app-list; inversedBy recommended_apps |
| app_category | relation / manyToOne | false |  | api::app-category.app-category; inversedBy recommended_apps |

## RecommendedBook

Source: [src/api/recommended-book/content-types/recommended-book/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommended-book/content-types/recommended-book/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| volume_id | string | true |  |  |
| title | string | true |  |  |
| subtitle | string | false |  |  |
| authors | json | false |  |  |
| publisher | string | false |  |  |
| published_date | string | false |  |  |
| year | string | false |  |  |
| description | text | false |  |  |
| cover_url | string | false |  |  |
| cover_url_large | string | false |  |  |
| subjects | json | false |  |  |
| page_count | integer | false |  |  |
| isbn_13 | string | false |  |  |
| isbn_10 | string | false |  |  |
| google_rating | decimal | false |  |  |
| ratings_count | integer | false |  |  |
| language | string | false |  |  |
| preview_link | string | false |  |  |
| user_recommendation_note | blocks | false |  |  |
| user_rating | integer | false |  |  |
| buy_links | json | false |  |  |
| is_pinned | boolean | false |  |  |
| pin_order | integer | false |  |  |
| display_order | integer | false |  |  |
| Media | media | false |  |  |
| media_details | json | false |  |  |
| book_list | relation / manyToOne | false |  | api::book-list.book-list; inversedBy recommended_books |
| book_categories | relation / manyToMany | false |  | api::book-category.book-category; mappedBy recommended_books |

## RecommendedGame

Source: [src/api/recommended-game/content-types/recommended-game/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommended-game/content-types/recommended-game/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| igdb_id | integer | true |  |  |
| igdb_slug | string | false |  |  |
| title | string | true |  |  |
| igdb_image_id | string | false |  |  |
| cover_url | string | false |  |  |
| cover_url_large | string | false |  |  |
| summary | text | false |  |  |
| release_date | string | false |  |  |
| release_year | string | false |  |  |
| igdb_rating | decimal | false |  |  |
| igdb_rating_count | integer | false |  |  |
| genres | json | false |  |  |
| platforms | json | false |  |  |
| developer | string | false |  |  |
| publisher | string | false |  |  |
| game_modes | json | false |  |  |
| screenshot_ids | json | false |  |  |
| igdb_url | string | false |  |  |
| user_recommendation_note | blocks | false |  |  |
| user_rating | integer | false |  |  |
| is_pinned | boolean | false | false |  |
| pin_order | integer | false |  |  |
| display_order | integer | false |  |  |
| Media | media | false |  |  |
| media_details | json | false |  |  |
| game_list | relation / manyToOne | false |  | api::game-list.game-list; inversedBy recommended_games |
| game_categories | relation / manyToMany | false |  | api::game-category.game-category; mappedBy recommended_games |

## RecommendedMovie

Source: [src/api/recommended-movie/content-types/recommended-movie/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommended-movie/content-types/recommended-movie/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| tmdb_id | string | true |  |  |
| media_type | enumeration | true |  | Movie, Show, TV |
| title | string | true |  |  |
| original_title | string | false |  |  |
| year | string | false |  |  |
| poster_path | string | false |  |  |
| backdrop_path | string | false |  |  |
| genres | json | false |  |  |
| director | string | false |  |  |
| runtime | integer | false |  |  |
| tmdb_rating | decimal | false |  |  |
| overview | text | false |  |  |
| season_count | integer | false |  |  |
| user_recommendation_note | blocks | false |  |  |
| watch_providers | json | false |  |  |
| is_pinned | boolean | false | false |  |
| pin_order | integer | false |  |  |
| display_order | integer | false |  |  |
| media_details | json | false |  |  |
| Media | media | false |  |  |
| movie_list | relation / manyToOne | false |  | api::movie-list.movie-list; inversedBy recommended_movies |
| movie_categories | relation / oneToMany | false |  | api::movie-category.movie-category; mappedBy recommended_movie |
| cast_details | json | false |  |  |
| user_rating | integer | false |  |  |

## RecommendedPerson

Source: [src/api/recommended-person/content-types/recommended-person/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommended-person/content-types/recommended-person/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| name | string | true |  |  |
| username_handle | string | false |  |  |
| headline | string | false |  |  |
| location | string | false |  |  |
| avatar_path | string | false |  |  |
| primary_platform | enumeration | false | "linkedin" | instagram, linkedin, twitter, github, youtube, website, other |
| social_urls | json | false |  |  |
| skills_tags | json | false |  |  |
| user_recommendation_note | blocks | false |  |  |
| user_rating | integer | false |  |  |
| is_pinned | boolean | false | false |  |
| pin_order | integer | false |  |  |
| display_order | integer | false | 0 |  |
| Media | media | false |  |  |
| media_details | json | false |  |  |
| person_list | relation / manyToOne | false |  | api::person-list.person-list; inversedBy recommended_people |
| people_category | relation / manyToOne | false |  | api::people-category.people-category; inversedBy recommended_people |

## Recommended_place

Source: [src/api/recommended-place/content-types/recommended-place/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommended-place/content-types/recommended-place/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Place_Details | json | false |  |  |
| Contact_Name | string | false |  |  |
| Contact_Number | string | false |  |  |
| recommendation_category | relation / oneToOne | false |  | api::recommendation-category.recommendation-category |
| Places_Social_Link | string | false |  |  |
| Places_Website | string | false |  |  |
| Users_Place_Note | blocks | false |  |  |
| Users_Social_URL | string | false |  |  |
| Media | media | false |  |  |
| media_details | json | false |  |  |
| supporters | json | false |  |  |
| Source_Of_Recommendation | enumeration | false |  | self, suggestion |
| recommendation_list | relation / manyToOne | false |  | api::recommendation-list.recommendation-list; inversedBy recommended_places |
| recommendation_sub_category | relation / oneToOne | false |  | api::recommendation-sub-category.recommendation-sub-category |
| supporter | relation / oneToOne | false |  | api::supporter.supporter; mappedBy recommended_place |
| user_recommendation_note | richtext | false |  |  |
| Recommendation_Type | enumeration | false |  | place, person |
| Person_Details | json | false |  |  |
| user_rating | integer | false |  |  |
| google_rating | decimal | false |  |  |

## RecommendedProduct

Source: [src/api/recommended-product/content-types/recommended-product/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/recommended-product/content-types/recommended-product/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| product_url | string | true |  |  |
| title | string | true |  |  |
| brand | string | false |  |  |
| price | decimal | false |  |  |
| currency | string | false |  |  |
| buy_url | string | false |  |  |
| logo_url | string | false |  |  |
| description | text | false |  |  |
| specifications | json | false |  |  |
| user_recommendation_note | blocks | false |  |  |
| user_rating | integer | false |  |  |
| is_pinned | boolean | false | false |  |
| pin_order | integer | false |  |  |
| display_order | integer | false | 0 |  |
| images | json | false |  |  |
| product_list | relation / manyToOne | false |  | api::product-list.product-list; inversedBy recommended_products |
| product_category | relation / manyToOne | false |  | api::product-category.product-category; inversedBy recommended_products |

## Song_limit

Source: [src/api/song-limit/content-types/song-limit/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/song-limit/content-types/song-limit/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| username | string | false |  |  |
| song_requests | integer | false |  |  |
| ai_guide_requests | integer | false | 0 |  |

## Subscription_plan_base

Source: [src/api/subscription-plan-base/content-types/subscription-plan-base/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/subscription-plan-base/content-types/subscription-plan-base/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| plan_name | string | false |  |  |
| cost | string | false |  |  |
| songs_quota | string | false |  |  |
| features | json | false |  |  |
| duration | enumeration | false |  | monthly, yearly |
| plan_code | string | false |  |  |
| feature_control | json | false |  |  |
| max_devices | integer | false |  |  |
| ai_guide_quota | string | false |  |  |

## Supporter

Source: [src/api/supporter/content-types/supporter/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/supporter/content-types/supporter/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| recommended_place | relation / oneToOne | false |  | api::recommended-place.recommended-place; inversedBy supporter |
| accounts | relation / oneToMany | false |  | api::account.account |

## Unsubscribe

Source: [src/api/unsubscribe/content-types/unsubscribe/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/unsubscribe/content-types/unsubscribe/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| email | email | true |  | unique |
| feedback | string | false |  |  |
| unsubscribedAt | datetime | false |  |  |

## User_subscription_plan

Source: [src/api/user-subscription-plan/content-types/user-subscription-plan/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/user-subscription-plan/content-types/user-subscription-plan/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| user_id | string | false |  |  |
| start_date | datetime | false |  |  |
| end_date | datetime | false |  |  |
| plan_id | string | false |  |  |
| razorpay_sub_id | string | false |  |  |
| razorpay_plan_id | string | false |  |  |
| razorpay_customer_id | string | false |  |  |

## Verify_Claim

Source: [src/api/verify-claim/content-types/verify-claim/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/api/verify-claim/content-types/verify-claim/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| Email | email | false |  |  |
| Phone | string | false |  |  |
| Message | text | false |  |  |
| Attachment | media | false |  |  |
| Name | string | false |  |  |

## User

Source: [src/extensions/users-permissions/content-types/user/schema.json](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/src/extensions/users-permissions/content-types/user/schema.json). Draft/publish: false. Localized: false.

| Field | Type/relation | Required | Default | Target / enum / constraint |
|---|---|---|---|---|
| username | string | true |  | unique |
| email | email | true |  |  |
| provider | string | false |  |  |
| password | password | false |  | private |
| resetPasswordToken | string | false |  | private |
| confirmationToken | string | false |  | private |
| confirmed | boolean | false | false |  |
| blocked | boolean | false | false |  |
| role | relation / manyToOne | false |  | plugin::users-permissions.role; inversedBy users |
| mobile_number | string | false |  |  |
| mobile_number_visibility | string | false |  |  |
| Language_preference | string | false |  |  |
| accounts | relation / manyToMany | false |  | api::account.account; mappedBy users_permissions_users |
| Language_Choice | string | false | "en" |  |
| is_subscribed | boolean | false | false |  |
| razorpay_customer_id | string | false |  |  |
| instagramUserId | string | false |  |  |
| instagramUsername | string | false |  |  |
| instagramAccountType | string | false |  |  |
| instagramAccessToken | text | false |  |  |
| movie_lists | relation / oneToMany | false |  | api::movie-list.movie-list; mappedBy account |

---

## Canonical coverage: see the coverage register

This file is a **field inventory of the legacy Strapi schemas only**. It records what each legacy type declares; it says nothing about whether a canonical destination exists, whether a drop was authorized, or who owes the work.

For that, see **[`strapi-coverage-register.md`](strapi-coverage-register.md)** — a per-type, per-field Strapi→canonical coverage register covering all 40 types and all 401 declared attributes, classifying each as MIGRATED, DROPPED-AUTHORIZED, MISSING or UNVERIFIED with a cited `file:line` on both sides.

Read these three framing points before using either document:

1. **This is not a data migration.** Historical user, media and analytics import is explicitly excluded (`migration-gap-audit-2026-10-05/identity-platform.md:17`; `revised-direction.md:51,55`). In the register, **MIGRATED means a canonical structure exists for the field's semantics** — never that rows move, that a write path is implemented, or that a UI consumes it.
2. **The authorization base is thin.** The only field- or type-level exclusion authority anywhere in this package is the 13-row agreed-scope table at `revised-direction.md:13-25` plus `:49` and `:53`, and `identity-platform.md:17`. There was no field-level drop register before the coverage register; every **MISSING** row there therefore records the *absence of an authorization record*, which is weaker than a recorded decision to drop.
3. **A field appearing in the tables above is not evidence that it survives.** As of `225d83e5`, 122 of the 401 attributes inventoried here have no canonical equivalent and no authorization record. The register's §7 lists the ones needing a product decision (`unsubscribe` email suppression, per-field i18n, Instagram token storage, the claim flow, `song-limit`, and three residual live-consumed fields) and its §8 names the owning ticket for each MISSING cluster.

Both documents read the same pinned legacy source, `50b6c6e180de4a1290b0c0a3c8450ac5947566d5`. The register re-derived all 40 schemas first-hand from the GitHub API rather than from this extraction, and its counts supersede any derived from `inspect-strapi.cjs` output where the two disagree.

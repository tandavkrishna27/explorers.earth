import { useState, useCallback, useEffect } from "react";
import { useParams, Link, useOutletContext, useLocation } from "react-router-dom";
import { ShoppingBag, ArrowLeft } from "lucide-react";
import { deduplicateProducts, buildImageUrl, formatPrice } from "../../utils/productHelpers";
import type { RecommendedProduct, ProductList } from "../../types";
import ProductDetailModal from "./ProductDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, isPublicProfileNotFound, PublicRouteErrorState, PublicRoutePartialNotice } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicProfileDetail } from "../../../PublicHome/api/usePublicProfileDetail";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const isRenderableProductList = (value: unknown): value is ProductList =>
  isNonNullObject(value) && Array.isArray(value.recommended_products);

const PublicProductList = () => {
  const { username, listSlug } = useParams<{ username: string; listSlug: string }>();
  const location = useLocation();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  const [selectedProduct, setSelectedProduct] = useState<RecommendedProduct | null>(null);

  const { data: accountData } = usePublicProfileShell(username);
  const page = usePublicProfileDetail(username, "products", listSlug);
  const { data, loading, error, refetch } = page;

  const list = (Array.isArray(data?.productLists) ? data.productLists : []).find(isRenderableProductList);
  const hasUsableData = Boolean(list);
  const products = deduplicateProducts<RecommendedProduct>(list?.recommended_products ?? []);
  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;
  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username;
  const analytics = useTrackAnalytics(
    {
      ...createAnalyticsOptions.products(accountDocumentId || "", username, list?.documentId),
      waitForLocation: true,
    },
  );

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleProductClick = useCallback((product: RecommendedProduct) => {
    setSelectedProduct(product);
    analytics.trackClick("product-card", {
      id: product.documentId,
      listId: list?.documentId,
      listName: list?.List_Name,
      title: product.title,
      category: product.product_category?.name,
    });
  }, [analytics, list]);

  usePublicHeaderDescriptor(list ? {
    navigationKey: location.key,
    title: list.List_Name,
    url: window.location.href,
    analyticsContext: "products-list-header",
    analyticsMetadata: {
      listId: list.documentId,
      listName: list.List_Name,
    },
  } : undefined);

  const pageTitle = list ? `${list.List_Name} | ${creatorName}'s Product List | explorers` : `Product List | explorers`;
  const metaDescription = list?.list_description 
    ? list.list_description 
    : list 
      ? `Explore the curated product list "${list.List_Name}" containing ${products.length}${page.hasMore ? "+" : ""} products recommended by ${creatorName} on explorers.`
      : "Explore product recommendations on explorers.";

  const seoKeywords = list 
    ? [`${list.List_Name}`, `${creatorName} products`, `${list.slug}`, "product list", "explorers"]
    : ["product list", "explorers"];

  const listImage = list?.cover_image?.url || (products[0]?.logo_url ? buildImageUrl(products[0].logo_url) : undefined);

  return (
    <>
      {!loading && list && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/products/${listSlug}`)}
          image={listImage}
          type="website"
          author={creatorName}
          siteName="explorers"
        />
      )}
      <div data-category-page className="min-h-screen bg-[var(--category-page,#0d1117)] text-[color:var(--category-text,#fff)]" aria-busy={loading || undefined}>
        {/* Header content section */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-2">
          <Link
            to={`/${username}/products`}
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--category-muted,rgba(255,255,255,0.5))] hover:text-[color:var(--category-text,rgba(255,255,255,0.8))] transition-colors mb-6"
          >
            <ArrowLeft size={14} /> {creatorName}'s Products
          </Link>

          {Boolean(error) && hasUsableData && <PublicRoutePartialNotice message="Some product data is unavailable." />}

          {loading && !hasUsableData ? (
            <>
              <div className="h-7 w-48 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded mb-2" />
              <div className="h-4 w-64 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded" />
            </>
          ) : error && !hasUsableData && !isPublicProfileNotFound(error) ? (
            <PublicRouteErrorState title="Product list unavailable" error={error} onRetry={refetch} />
          ) : list ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-poppins font-bold text-[color:var(--category-text,#fff)] mb-1">{list.List_Name}</h1>
                {list.list_description && (
                  <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-1 max-w-xl">{list.list_description}</p>
                )}
                <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-2">{products.length}{page.hasMore ? "+" : ""} product{products.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
          ) : (
            <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))]">List not found or not published.</p>
          )}
        </div>

        {/* Grid */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 md:pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {loading && !hasUsableData ? (
              [1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="h-52 rounded-2xl bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden" />
              ))
            ) : (
              products.map((product) => (
                <button
                  key={product.documentId}
                  onClick={() => handleProductClick(product)}
                  className="rounded-2xl bg-[var(--category-card,rgba(255,255,255,0.04))] border border-[color:var(--category-border,rgba(255,255,255,0.07))] hover:border-[color:var(--category-focus,rgba(16,185,129,0.4))] hover:bg-[var(--category-hover,rgba(255,255,255,0.07))] p-4 text-left transition-all flex flex-col w-full"
                >
                  <div className="w-full h-28 rounded-xl overflow-hidden bg-[var(--category-card,rgba(255,255,255,0.05))] mb-3 shadow-md">
                    {product.logo_url ? (
                      <img src={buildImageUrl(product.logo_url)} alt={product.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag size={20} className="text-[color:var(--category-muted,rgba(255,255,255,0.2))]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-[color:var(--category-text,#fff)] line-clamp-2 leading-tight mb-1">{product.title}</p>
                  {product.brand && (
                    <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.4))] truncate w-full mb-2">{product.brand}</p>
                  )}
                  {product.price && (
                    <p className="text-xs font-bold text-[color:var(--category-text,#34d399)] mt-auto">{formatPrice(product.price, product.currency)}</p>
                  )}
                </button>
              ))
            )}
          </div>
          <PublicScrollContinuation {...page} label="products" className="mt-6" />
        </div>

        <ProductDetailModal
          open={!!selectedProduct}
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      </div>
    </>
  );
};

export default PublicProductList;

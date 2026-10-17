/**
 * Strapi GraphQL Queries
 * All queries for fetching data from Strapi CMS
 */

import { useQuery } from "@tanstack/react-query";
import { strapiRequest } from "./strapi-client";
import { apiRequest } from "./queryClient";

// Types
export interface Faq {
  documentId: string;
  Question: string;
  Answer: string;
  Sequence: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface SubscriptionPlanBase {
  documentId: string;
  plan_name: string;
  cost: string;
  songs_quota: string;
  features: Array<{ feature: string }>;
  duration: string;
  plan_code: string;
  feature_control?: {
    features: string[];
  };
  max_devices: number;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

export interface Account {
  documentId: string;
  username: string;
  email: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

export interface UsersPermissionsUser {
  documentId: string;
  username: string;
  email: string;
  is_subscribed: boolean;
}

export interface UserSubscriptionPlan {
  documentId: string;
  user_id: string;
  plan_id: string;
  start_date: string;
  end_date?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

export interface SongLimit {
  documentId: string;
  username: string;
  song_requests: number;
  ai_guide_requests?: number;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

// Query responses
interface FaqsQueryResponse {
  faqs: Faq[];
}

interface SubscriptionPlanBasesQueryResponse {
  subscriptionPlanBases: SubscriptionPlanBase[];
}

interface AccountsQueryResponse {
  accounts: Account[];
}

interface UserSubscriptionPlansQueryResponse {
  userSubscriptionPlans: UserSubscriptionPlan[];
}

interface SongLimitsQueryResponse {
  songLimits: SongLimit[];
}

interface UsersPermissionsUsersQueryResponse {
  usersPermissionsUsers: UsersPermissionsUser[];
}

// GraphQL Queries
const FAQS_QUERY = `
  query Faqs($filters: FaqFiltersInput, $pagination: PaginationArg, $sort: [String], $status: PublicationStatus, $locale: I18NLocaleCode) {
    faqs(filters: $filters, pagination: $pagination, sort: $sort, status: $status, locale: $locale) {
      documentId
      Question
      Answer
      Sequence
      createdAt
      updatedAt
      publishedAt
      locale
    }
  }
`;

const SUBSCRIPTION_PLAN_BASES_QUERY = `
  query SubscriptionPlanBases($filters: SubscriptionPlanBaseFiltersInput, $pagination: PaginationArg, $sort: [String], $status: PublicationStatus) {
    subscriptionPlanBases(filters: $filters, pagination: $pagination, sort: $sort, status: $status) {
      documentId
      plan_name
      cost
      songs_quota
      features
      duration
      plan_code
      feature_control
      max_devices
      createdAt
      updatedAt
      publishedAt
    }
  }
`;

const USERS_PERMISSIONS_USERS_QUERY = `
  query UsersPermissionsUsers($filters: UsersPermissionsUserFiltersInput) {
    usersPermissionsUsers(filters: $filters) {
      documentId
      username
      email
      is_subscribed
    }
  }
`;

const ACCOUNTS_QUERY = `
  query Accounts($filters: AccountFiltersInput, $pagination: PaginationArg, $sort: [String], $status: PublicationStatus) {
    accounts(filters: $filters, pagination: $pagination, sort: $sort, status: $status) {
      documentId
      username
      email
      createdAt
      updatedAt
      publishedAt
    }
  }
`;

const USER_SUBSCRIPTION_PLANS_QUERY = `
  query UserSubscriptionPlans($filters: UserSubscriptionPlanFiltersInput, $pagination: PaginationArg, $sort: [String], $status: PublicationStatus) {
    userSubscriptionPlans(filters: $filters, pagination: $pagination, sort: $sort, status: $status) {
      documentId
      user_id
      plan_id
      start_date
      end_date
      createdAt
      updatedAt
      publishedAt
    }
  }
`;

const SONG_LIMITS_QUERY = `
  query SongLimits($filters: SongLimitFiltersInput, $pagination: PaginationArg, $sort: [String], $status: PublicationStatus) {
    songLimits(filters: $filters, pagination: $pagination, sort: $sort, status: $status) {
      documentId
      username
      song_requests
      ai_guide_requests
      createdAt
      updatedAt
      publishedAt
    }
  }
`;

// React Query Hooks
export function useFaqs(options?: {
  filters?: any;
  pagination?: any;
  sort?: string[];
  status?: "PUBLISHED" | "DRAFT";
  locale?: string;
  enabled?: boolean;
}) {
  return useQuery<Faq[]>({
    queryKey: ["strapi", "faqs", options],
    queryFn: async () => {
      const data = await strapiRequest<FaqsQueryResponse>(FAQS_QUERY, {
        filters: options?.filters,
        pagination: options?.pagination,
        sort: options?.sort || ["Sequence:asc"],
        status: options?.status || "PUBLISHED",
        locale: options?.locale,
      });
      return data.faqs;
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useSubscriptionPlanBases(options?: {
  filters?: any;
  pagination?: any;
  sort?: string[];
  status?: "PUBLISHED" | "DRAFT";
  enabled?: boolean;
}) {
  return useQuery<SubscriptionPlanBase[]>({
    queryKey: ["strapi", "subscriptionPlanBases", options],
    queryFn: async () => [],
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAccounts(options?: {
  filters?: any;
  pagination?: any;
  sort?: string[];
  status?: "PUBLISHED" | "DRAFT";
  enabled?: boolean;
}) {
  return useQuery<Account[]>({
    queryKey: ["strapi", "accounts", options],
    queryFn: async () => {
      const data = await strapiRequest<AccountsQueryResponse>(ACCOUNTS_QUERY, {
        filters: options?.filters,
        pagination: options?.pagination,
        sort: options?.sort,
        status: options?.status || "PUBLISHED",
      });
      return data.accounts;
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserSubscriptionPlans(options?: {
  filters?: any;
  pagination?: any;
  sort?: string[];
  status?: "PUBLISHED" | "DRAFT";
  enabled?: boolean;
}) {
  return useQuery<UserSubscriptionPlan[]>({
    queryKey: ["strapi", "userSubscriptionPlans", options],
    queryFn: async () => [],
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSongLimits(options?: {
  filters?: any;
  pagination?: any;
  sort?: string[];
  status?: "PUBLISHED" | "DRAFT";
  enabled?: boolean;
}) {
  return useQuery<SongLimit[]>({
    queryKey: ["strapi", "songLimits", options],
    queryFn: async () => [],
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUsersPermissionsUsers(options?: {
  filters?: any;
  enabled?: boolean;
}) {
  return useQuery<UsersPermissionsUser[]>({
    queryKey: ["strapi", "usersPermissionsUsers", options],
    queryFn: async () => {
      const data = await strapiRequest<UsersPermissionsUsersQueryResponse>(
        USERS_PERMISSIONS_USERS_QUERY,
        {
          filters: options?.filters,
        }
      );
      return data.usersPermissionsUsers;
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000,
  });
}

// Combined hook for subscription plan info
export interface SubscriptionPlanInfo {
  plan: SubscriptionPlanBase | null;
  songRequests: number;
  songsQuota: number;
  isLoading: boolean;
  error: Error | null;
  latestSubscription: UserSubscriptionPlan | null;
  isActivePlan: boolean;
}

export function useUserSubscriptionPlanInfo(username: string | null | undefined): SubscriptionPlanInfo {
  const entitlement = useQuery<{
    state: string;
    coreRead: boolean;
    coreMutation: boolean;
    paidMutation: boolean;
  }>({
    queryKey: ["music", "entitlement"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/music/entitlement");
      return response.json();
    },
    enabled: !!username,
    staleTime: 60_000,
  });

  return {
    plan: null,
    songRequests: 0,
    songsQuota: 0,
    isLoading: entitlement.isLoading,
    error: entitlement.error instanceof Error ? entitlement.error : null,
    latestSubscription: null,
    // Core personal Music remains included. Paid mutation authority is exposed
    // separately and never inferred from a browser-selected user or plan.
    isActivePlan: entitlement.data?.coreMutation ?? true,
  };
}


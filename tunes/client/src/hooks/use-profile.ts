import { useQuery, UseQueryResult } from "@tanstack/react-query";
import type { UserProfile } from "@shared/schema";

export function useProfile() {
  return useQuery<UserProfile>({
    queryKey: ["music-profile-managed-by-explorer"],
    enabled: false,
  });
}

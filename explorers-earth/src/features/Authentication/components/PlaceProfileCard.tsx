import React from "react";
import Button from "../../../components/ui/Button";
import { normalizePublicWebHref } from "../../PublicHome/utils/publicProfileContent";

interface ClaimablePlaceProfile {
  documentId: string;
  Name: string;
  Phone: string;
  Address: string;
  Website: string;
  Recommendation_Count: number;
  Place_Id: string;
  Meta_Data: {
    types?: string[];
    photos?: string[];
    rating?: number;
    priceLevel?: string;
    ratingCount?: string;
    user_ratings_total?: number;
  };
  Long: number;
  Lat: number;
  Is_Claimed: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

interface PlaceProfileCardProps {
  profile: ClaimablePlaceProfile;
  onClaim: () => void;
  onBack: () => void;
  showVerifyButton?: boolean;
}

const PlaceProfileCard: React.FC<PlaceProfileCardProps> = ({
  profile,
  onClaim,
  onBack,
  showVerifyButton = false,
}) => {
  const websiteHref = normalizePublicWebHref(profile.Website);

  const getPlaceTypes = () => {
    if (!profile.Meta_Data?.types) return "Place";
    return profile.Meta_Data.types
      .map((type) => type.replace(/_/g, " "))
      .join(", ");
  };

  const getRatingDisplay = () => {
    const rating = profile.Meta_Data?.rating;
    const ratingCount = profile.Meta_Data?.user_ratings_total;
    
    if (rating && ratingCount) {
      return `${rating}/5 (${ratingCount.toLocaleString()} reviews)`;
    }
    return "No ratings available";
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      {/* Header */}
      <div className="text-center px-2">
        <h2 className="text-lg sm:text-xl font-semibold text-dashboard mb-1 sm:mb-2">
          explorers Account found
        </h2>
        <p className="text-dashboard-light text-xs sm:text-sm">
          We found a matching account in our system
        </p>
      </div>

      {/* Profile Details */}
      <div className="space-y-3 sm:space-y-4">
        {/* Place Name */}
        <div className="bg-dashboard-muted rounded-lg p-3 sm:p-4 border border-dashboard">
          <h3 className="text-base sm:text-lg font-semibold text-dashboard mb-1 break-words">
            {profile.Name}
          </h3>
          <p className="text-dashboard-light text-xs sm:text-sm break-words">
            {getPlaceTypes()}
          </p>
        </div>

        {/* Address */}
        <div className="bg-dashboard-muted rounded-lg p-3 sm:p-4 border border-dashboard">
          <h4 className="text-xs sm:text-sm font-medium text-dashboard-light mb-1">
            Address
          </h4>
          <p className="text-dashboard text-xs sm:text-sm break-words">{profile.Address}</p>
        </div>

        {/* Contact Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {profile.Phone && (
            <div className="bg-dashboard-muted rounded-lg p-3 sm:p-4 border border-dashboard">
              <h4 className="text-xs sm:text-sm font-medium text-dashboard-light mb-1">
                Phone Number
              </h4>
              <p className="text-dashboard text-xs sm:text-sm break-words">{profile.Phone}</p>
            </div>
          )}

          {profile.Website && (
            <div className="bg-dashboard-muted rounded-lg p-3 sm:p-4 border border-dashboard">
              <h4 className="text-xs sm:text-sm font-medium text-dashboard-light mb-1">
                Website
              </h4>
              {websiteHref ? (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dashboard-accent hover:text-dashboard-accent underline text-xs sm:text-sm break-all"
                >
                  {profile.Website}
                </a>
              ) : (
                <p className="text-dashboard text-xs sm:text-sm break-all">
                  {profile.Website}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-dashboard-muted rounded-lg p-3 sm:p-4 border border-dashboard text-center">
            <h4 className="text-xs sm:text-sm font-medium text-dashboard-light mb-1">
              People Recommended
            </h4>
            <p className="text-xl sm:text-2xl font-bold text-dashboard-accent">
              {profile.Recommendation_Count}
            </p>
          </div>

          <div className="bg-dashboard-muted rounded-lg p-3 sm:p-4 border border-dashboard text-center">
            <h4 className="text-xs sm:text-sm font-medium text-dashboard-light mb-1">
              Rating
            </h4>
            <p className="text-xs sm:text-sm font-semibold text-dashboard break-words">
              {getRatingDisplay()}
            </p>
          </div>

          <div className="bg-dashboard-muted rounded-lg p-3 sm:p-4 border border-dashboard text-center">
            <h4 className="text-xs sm:text-sm font-medium text-dashboard-light mb-1">
              Status
            </h4>
            <p className={`text-xs sm:text-sm font-semibold ${
              profile.Is_Claimed ? "text-green-500" : "text-dashboard-accent"
            }`}>
              {profile.Is_Claimed ? "Claimed" : "Available"}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4">
        <Button
          type="button"
          onClick={onBack}
          variant="secondary"
          btnText="Back to Search"
          className="flex-1 w-full"
        />
            <Button
              type="button"
              onClick={onClaim}
              variant="primary"
              btnText={showVerifyButton ? "Verify & Claim This Place" : (profile.Is_Claimed ? "Already Claimed" : "Claim This Place")}
              disabled={profile.Is_Claimed}
              className="flex-1 w-full"
            />
      </div>

      {/* Claim Status Message */}
      {profile.Is_Claimed && (
        <div className="bg-dashboard-muted border border-dashboard rounded-lg p-3 sm:p-4">
          <p className="text-dashboard-light text-xs sm:text-sm text-center break-words">
            This place has already been claimed by another user.
          </p>
        </div>
      )}
    </div>
  );
};

export default PlaceProfileCard;

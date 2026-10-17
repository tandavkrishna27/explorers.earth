import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { toast } from "sonner";
import { EarthLoader } from "../components/EarthLoader";
import { Check, Music2, Sparkles, Zap, Crown, X } from "lucide-react";
import useAuthStore from "../store/store";
import { isFreePlan } from "../services/paymentService";
import { getSubscriptionPlans, getUserSubscriptionPlans, getSongLimits, updateSongLimit as updateSongLimitAPI, createSongLimit, createUserSubscriptionPlan } from "../services/subscriptionService";
import { MUSIC_SUBSCRIPTION_FLOWS_ENABLED, MusicSubscriptionUnavailable } from "../components/MusicSubscriptionContainment";


const subscriptionWriteUnavailable = () => {
  // Ticket 7.3 / step 9. The Strapi subscription write is gone and no canonical
  // subscription state exists to replace it - decision D1 owns whether monetization returns
  // and in what shape. Until then this throws rather than silently succeeding, so that
  // flipping MUSIC_SUBSCRIPTION_FLOWS_ENABLED without porting the flow fails loudly instead
  // of writing to a retired backend.
  throw new Error('Music subscription changes are unavailable');
};

interface SubscriptionPlan {
  documentId: string;
  plan_name: string;
  cost: string;
  songs_quota: string;
  ai_guide_quota: string;
  features: Array<{ feature: string }> | string;
  duration: string;
  plan_code: string;
  feature_control: any;
  max_devices: number;
}

interface LocationState {
  fromOnboarding?: boolean;
  fromMusic?: boolean;
  fromSettings?: boolean;
  formData?: any;
  preselectedPlan?: string;
}

interface SubscriptionPlansProps {
  onComplete?: () => void;
  fromMusic?: boolean;
  fromSettings?: boolean;
  fromOnboarding?: boolean;
}

const ActiveSubscriptionPlans = ({
  onComplete,
  fromMusic: propFromMusic,
  fromSettings: propFromSettings,
  fromOnboarding: propFromOnboarding
}: SubscriptionPlansProps = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  // Use props if provided, otherwise fall back to location state
  const fromMusic = propFromMusic ?? state?.fromMusic ?? false;
  const fromSettings = propFromSettings ?? state?.fromSettings ?? false;
  const fromOnboarding = propFromOnboarding ?? state?.fromOnboarding ?? false;
  const { user: authUser } = useAuthStore();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(state?.preselectedPlan || null);
  const [selectedPlanData, setSelectedPlanData] = useState<SubscriptionPlan | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsPlan, setDetailsPlan] = useState<SubscriptionPlan | null>(null);

  // Fetch subscription plans from backend API
  const { data: plansData, isLoading: loading, error } = useReactQuery({
    queryKey: ['subscriptionPlans'],
    queryFn: getSubscriptionPlans,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Query to get user's current subscription from backend API
  const { data: userSubscriptionData } = useReactQuery({
    queryKey: ['userSubscriptionPlans', authUser?.documentId],
    queryFn: () => getUserSubscriptionPlans(authUser!.documentId),
    enabled: !!authUser?.documentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });


  const plans: SubscriptionPlan[] = plansData || [];

  // Auto-select plan if preselected from navigation
  useEffect(() => {
    if (state?.preselectedPlan && plans.length > 0) {
      const preselectedPlanData = plans.find(p => p.documentId === state.preselectedPlan);
      if (preselectedPlanData) {
        setSelectedPlan(state.preselectedPlan);
        setSelectedPlanData(preselectedPlanData);
      }
    }
  }, [state?.preselectedPlan, plans]);

  // Get current subscription (latest by start_date)
  const currentSubscription = userSubscriptionData && userSubscriptionData.length > 0
    ? [...userSubscriptionData].sort((a: any, b: any) => {
      const dateA = new Date(a.start_date).getTime();
      const dateB = new Date(b.start_date).getTime();
      return dateB - dateA; // Sort descending to get latest first
    })[0]
    : null;

  // Get current plan details
  const currentPlanDetails = currentSubscription
    ? plans.find(p => p.documentId === currentSubscription.plan_id)
    : null;

  // Helper function to get plan hierarchy value
  const getPlanHierarchyValue = (plan: SubscriptionPlan): number => {
    const planName = plan.plan_name.toLowerCase();
    const duration = plan.duration.toLowerCase();

    // Free = 1, Paid Monthly = 2, Paid Yearly = 3, PRO Monthly = 4, PRO Yearly = 5
    if (planName === 'free') return 1;
    if (planName === 'paid' && duration === 'monthly') return 2;
    if (planName === 'paid' && duration === 'yearly') return 3;
    if (planName === 'pro' && (duration === 'monthly' || duration === 'monthly_pro')) return 4;
    if (planName === 'pro' && (duration === 'yearly' || duration === 'yearly_pro')) return 5;
    return 0; // Unknown plan
  };

  // Check if selected plan is a downgrade from current plan
  const isDowngrade = (selectedPlan: SubscriptionPlan): boolean => {
    if (!currentPlanDetails) return false; // No current plan, so no downgrade
    const currentValue = getPlanHierarchyValue(currentPlanDetails);
    const selectedValue = getPlanHierarchyValue(selectedPlan);
    return selectedValue < currentValue;
  };

  // Parse features if it's a string
  const parseFeatures = (features: Array<{ feature: string }> | string): Array<{ feature: string }> => {
    if (Array.isArray(features)) {
      return features;
    }
    if (typeof features === 'string') {
      try {
        const parsed = JSON.parse(features);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  // Format cost with commas
  const formatCost = (cost: string) => {
    const numCost = parseInt(cost);
    return numCost.toLocaleString();
  };

  // Get plan icon based on plan name
  const getPlanIcon = (planName: string) => {
    if (planName.toLowerCase() === 'free') return <Sparkles className="w-5 h-5" />;
    if (planName.toLowerCase() === 'paid') return <Crown className="w-5 h-5" />;
    return <Zap className="w-5 h-5" />;
  };

  // Sort plans: Free first, then Paid monthly, then Paid yearly, then PRO monthly, then PRO yearly
  const sortedPlans = [...plans].sort((a, b) => {
    const getOrder = (plan: SubscriptionPlan) => {
      const name = plan.plan_name.toLowerCase();
      const dur = plan.duration.toLowerCase();
      if (name === 'free') return 0;
      if (name === 'paid' && dur === 'monthly') return 1;
      if (name === 'paid' && dur === 'yearly') return 2;
      if (name === 'pro' && (dur === 'monthly' || dur === 'monthly_pro')) return 3;
      if (name === 'pro' && (dur === 'yearly' || dur === 'yearly_pro')) return 4;
      return 5;
    };
    return getOrder(a) - getOrder(b);
  });

  // Calculate subscription dates based on duration
  const calculateSubscriptionDates = (duration: string) => {
    const startDate = new Date();
    const endDate = new Date();

    if (duration === 'monthly' || duration === 'monthly_pro') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (duration === 'yearly' || duration === 'yearly_pro') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    return {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString()
    };
  };

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId);
    const plan = plans.find(p => p.documentId === planId);
    if (plan) {
      setSelectedPlanData(plan);
    }
  };

  const handleViewDetails = (plan: SubscriptionPlan, e: React.MouseEvent) => {
    e.stopPropagation();
    setDetailsPlan(plan);
    setShowDetailsModal(true);
  };

  const handleContinue = async () => {
    if (!selectedPlan || !selectedPlanData) {
      toast.error("Please select a subscription plan");
      return;
    }

    if (!authUser?.id || !authUser?.documentId) {
      toast.error("User information not available");
      return;
    }

    // Check if user is trying to downgrade
    if (isDowngrade(selectedPlanData)) {
      toast.error("You cannot downgrade to a lower plan. You can only upgrade to a higher plan.");
      return;
    }

    // Check if user is selecting the same plan
    if (currentPlanDetails && selectedPlan === currentSubscription?.plan_id) {
      toast.info("You are already on this plan.");
      return;
    }

    // Check if plan is free - if free, create subscription directly
    // If paid, navigate to checkout page
    if (!isFreePlan(selectedPlanData)) {
      // Navigate to checkout for paid plans
      navigate('/checkout', {
        state: {
          plan: selectedPlanData,
          fromMusic,
          fromSettings,
          fromOnboarding,
        },
      });
      return;
    }

    // For free plans, proceed with existing subscription creation flow
    setIsProcessing(true);

    try {
      // Calculate subscription dates
      const { start_date, end_date } = calculateSubscriptionDates(selectedPlanData.duration);

      // Step 1: Create subscription entry in User_subscription_plan (always create new record for upgrades)
      console.log('Creating subscription entry...');
      const subscriptionResponse = await createUserSubscriptionPlan({
        user_id: authUser.documentId,
        plan_id: selectedPlan,
        start_date: start_date,
        end_date: end_date
      });

      if (!subscriptionResponse) {
        throw new Error("Failed to create subscription entry");
      }

      console.log('Subscription entry created successfully');

      // Create or reset song_requests and ai_guide_requests for the user
      if (authUser?.username) {
        try {
          // Get the songLimit record for this user using API
          const songLimits = await getSongLimits(authUser.username);
          const songLimitRecord = songLimits?.[0];

          if (songLimitRecord?.documentId) {
            // Record exists - reset song_requests and ai_guide_requests to 0
            await updateSongLimitAPI(songLimitRecord.documentId, {
              song_requests: 0,
              ai_guide_requests: 0
            });
            console.log('Song requests and AI guide requests reset to 0');
          } else {
            // Record doesn't exist - create a new one with default values
            await createSongLimit({
              username: authUser.username,
              song_requests: 0,
              ai_guide_requests: 0
            });
            console.log('Song limit record created with default values (0/0)');
          }
        } catch (error) {
          // If getSongLimits fails, try to create a new record
          console.log('Song limit not found, attempting to create...', error);
          try {
            await createSongLimit({
              username: authUser.username,
              song_requests: 0,
              ai_guide_requests: 0
            });
            console.log('Song limit record created with default values (0/0)');
          } catch (createError) {
            console.log('Could not create song limit record:', createError);
          }
        }
      }

      // Step 2: Store selected plan in localStorage
      localStorage.setItem('selectedSubscriptionPlan', selectedPlan);

      subscriptionWriteUnavailable();

      toast.success("Subscription activated successfully!");

      // If onComplete callback is provided, use it (for inline usage)
      if (onComplete) {
        onComplete();
      } else {
        // Otherwise, navigate based on where user came from
        if (fromMusic) {
          navigate("/music");
        } else if (fromSettings) {
          navigate("/settings");
        } else {
          // Default: navigate to home (onboarding or direct access)
          navigate("/home");
        }
      }
    } catch (error: any) {
      console.error("Error processing subscription:", error);
      toast.error(error.message || "Failed to process subscription. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-theme bg-dashboard-bg min-h-screen">
        <EarthLoader context="subscription" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dashboard-bg p-4">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <Music2 className="w-16 h-16 text-dashboard-accent mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Oops!</h2>
            <p className="text-gray-400">Failed to load subscription plans</p>
          </div>
          <Button
            btnText="Go Back"
            variant="primary"
            onClickHandler={() => navigate(-1)}
            className="w-full sm:w-auto"
          />
        </div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dashboard-bg p-4">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <Music2 className="w-16 h-16 text-dashboard-accent mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">No Plans Available</h2>
            <p className="text-gray-400">Subscription plans are not available at the moment</p>
          </div>
          <Button
            btnText="Go Back"
            variant="primary"
            onClickHandler={() => navigate(-1)}
            className="w-full sm:w-auto"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-theme min-h-screen  py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto bg-dashboard-bg">
        {/* Header Section */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-dashboard-accent/20 blur-2xl rounded-full"></div>
              <div className="relative bg-black p-4 rounded-2xl border border-dashboard-accent/30">
                <img
                  src="/locar-tunes.png"
                  alt="Music"
                  className="w-8 h-8 sm:w-10 sm:h-10 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextElementSibling) {
                      (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                    }
                  }}
                />
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 flex items-center justify-center rounded-lg hidden">
                  <Music2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
              </div>
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Choose Your Plan
          </h1>
          <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto">
            Select the perfect subscription plan to unlock Music features and enhance your music experience
          </p>
        </div>

        {/* Plans Grid - Single Column */}
        <div className="flex flex-col gap-4 lg:gap-6 mb-12 max-w-5xl mx-auto">
          {sortedPlans.map((plan) => {
            const features = parseFeatures(plan.features);
            const isSelected = selectedPlan === plan.documentId;
            const isFree = plan.plan_name.toLowerCase() === 'free';
            const isPro = plan.plan_name.toLowerCase() === 'pro';
            const isYearly = plan.duration === 'yearly' || plan.duration === 'yearly_pro';
            const isDowngradePlan = isDowngrade(plan);
            const isCurrentPlan = currentSubscription?.plan_id === plan.documentId;

            return (
              <div
                key={plan.documentId}
                onClick={() => {
                  // Always allow opening view details modal when clicking anywhere on the card
                  handleViewDetails(plan, {} as React.MouseEvent);
                }}
                className={`relative group transition-all duration-300 ${isDowngradePlan
                  ? 'cursor-pointer opacity-40 grayscale'
                  : 'cursor-pointer'
                  } ${isSelected
                    ? 'transform scale-[1.02]'
                    : 'hover:scale-[1.01]'
                  }`}
              >

                {/* Plan Card */}
                <div
                  className={`relative bg-dashboard-sidebar rounded-2xl p-4 sm:p-6 border-2 transition-all duration-300 ${isSelected
                    ? 'border-dashboard-accent shadow-2xl shadow-dashboard-accent/30 bg-gradient-to-br from-dashboard-sidebar to-dashboard-sidebar/80'
                    : isCurrentPlan
                      ? 'border-green-500/50 shadow-lg shadow-green-500/20'
                      : isDowngradePlan
                        ? 'border-white/30'
                        : isFree
                          ? 'border-gray-700 hover:border-gray-600'
                          : 'border-gray-700 hover:border-dashboard-accent/50'
                    }`}
                >
                  {/* Current Plan Badge */}
                  {isCurrentPlan && (
                    <div className="absolute -top-3 right-4 bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-green-300/50">
                      Current Plan
                    </div>
                  )}

                  {/* Popular Badge for Yearly or PRO */}
                  {isPro && !isSelected && !isCurrentPlan && !isDowngradePlan && (
                    <div className="absolute -top-3 right-4 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-purple-300/50">
                      PRO
                    </div>
                  )}

                  {/* Best Value Badge for Yearly (non-PRO) */}
                  {isYearly && !isPro && !isSelected && !isCurrentPlan && !isDowngradePlan && (
                    <div className="absolute -top-3 right-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-yellow-300/50">
                      Best Value
                    </div>
                  )}

                  {/* Selected Badge on Card (when selected) */}
                  {isSelected && !isCurrentPlan && (
                    <div className="absolute -top-3 right-4 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-blue-300/50">
                      Selected
                    </div>
                  )}

                  {/* Downgrade Not Allowed Badge */}
                  {isDowngradePlan && !isCurrentPlan && (
                    <div className="absolute -top-3 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-red-300/50">
                      Downgrade Not Allowed
                    </div>
                  )}

                  {/* Plan Header - Compact Layout */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`p-2 rounded-xl ${isFree
                        ? 'bg-gray-700/50 text-gray-300'
                        : 'bg-dashboard-accent/20 text-dashboard-accent'
                        }`}>
                        {getPlanIcon(plan.plan_name)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-lg sm:text-xl font-bold text-white">
                            {plan.plan_name}
                          </h3>
                          <p className="text-xs text-gray-400 uppercase tracking-wider">
                            {plan.duration}
                          </p>
                        </div>
                        {/* Price */}
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl sm:text-3xl font-bold text-white">
                            ${formatCost(plan.cost)}
                          </span>
                          {!isFree && (
                            <span className="text-gray-400 text-sm sm:text-base">
                              /{(plan.duration === 'monthly' || plan.duration === 'monthly_pro') ? 'mo' : 'yr'}
                            </span>
                          )}
                        </div>
                        {isYearly && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            ${formatCost((parseInt(plan.cost) / 12).toFixed(0))} per month
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Key Features - Compact with Badges */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {plan.songs_quota && (
                      <div className="flex items-center gap-2 p-2.5 bg-dashboard-bg/50 rounded-lg">
                        <div className="flex-shrink-0 w-4 h-4 bg-dashboard-accent/20 rounded flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-dashboard-accent" />
                        </div>
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-gray-800 rounded-full shadow-md border border-gray-700">
                          {plan.songs_quota} Songs
                        </span>
                      </div>
                    )}
                    {plan.ai_guide_quota && (
                      <div className="flex items-center gap-2 p-2.5 bg-dashboard-bg/50 rounded-lg">
                        <div className="flex-shrink-0 w-4 h-4 bg-dashboard-accent/20 rounded flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-dashboard-accent" />
                        </div>
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-gray-800 rounded-full shadow-md border border-gray-700">
                          {plan.ai_guide_quota} AI Guides
                        </span>
                      </div>
                    )}
                    {plan.max_devices && (
                      <div className="flex items-center gap-2 p-2.5 bg-dashboard-bg/50 rounded-lg">
                        <div className="flex-shrink-0 w-4 h-4 bg-dashboard-accent/20 rounded flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-dashboard-accent" />
                        </div>
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-gray-800 rounded-full shadow-md border border-gray-700">
                          Up to {plan.max_devices} Devices
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Features List - Show only 3-4 with "+n more" */}
                  {features.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Features
                      </h4>
                      <div className="space-y-1.5">
                        {features.slice(0, 3).map((feature, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2"
                          >
                            <div className="flex-shrink-0 w-4 h-4 mt-0.5 bg-dashboard-accent/20 rounded flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-dashboard-accent" />
                            </div>
                            <span className="text-gray-300 text-xs leading-relaxed">
                              {typeof feature === 'object' ? feature.feature : feature}
                            </span>
                          </div>
                        ))}
                        {features.length > 3 && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-gray-400 text-xs font-medium">
                              +{features.length - 3} more features
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDetails(plan, e);
                      }}
                      className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs sm:text-sm transition-all duration-300 bg-dashboard-bg text-white border-2 border-gray-600 hover:border-dashboard-accent/50 hover:bg-dashboard-bg/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      View Details
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDowngradePlan && !isCurrentPlan) {
                          handlePlanSelect(plan.documentId);
                        }
                      }}
                      disabled={isProcessing || isDowngradePlan || isCurrentPlan}
                      className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs sm:text-sm transition-all duration-300 ${isSelected
                        ? 'bg-dashboard-bg text-white border-2 border-gray-600 hover:border-dashboard-accent/50'
                        : isCurrentPlan
                          ? 'bg-green-600/20 text-green-400 border-2 border-green-600/50'
                          : isDowngradePlan
                            ? 'bg-gray-800/50 text-gray-500 border-2 border-gray-700 cursor-not-allowed'
                            : 'bg-dashboard-bg text-white border-2 border-gray-600 hover:border-dashboard-accent/50 hover:bg-dashboard-bg/80'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isCurrentPlan ? 'Current Plan' : isDowngradePlan ? 'Downgrade Not Allowed' : isSelected ? 'Selected' : 'Select Plan'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Continue Button */}
        <div className="flex justify-center">
          <Button
            btnText={isProcessing ? "Processing..." : "Continue"}
            variant="primary"
            size="large"
            onClickHandler={handleContinue}
            isLoading={isProcessing}
            disabled={!selectedPlan || isProcessing}
            className="w-full sm:w-auto min-w-[200px] sm:min-w-[240px] text-base sm:text-lg py-4 px-8 rounded-xl font-semibold shadow-lg shadow-dashboard-accent/20 hover:shadow-xl hover:shadow-dashboard-accent/30 transition-all duration-300"
          />
        </div>

        {/* Back Button (only if not from onboarding and not using inline mode) */}
        {!fromOnboarding && !onComplete && (
          <div className="text-center mt-6">
            <button
              onClick={() => navigate(-1)}
              disabled={isProcessing}
              className="text-gray-400 hover:text-white text-sm transition-colors duration-200 disabled:opacity-50"
            >
              ← Go Back
            </button>
          </div>
        )}

        {/* Back Button for inline mode (when embedded in Music page) */}
        {onComplete && (
          <div className="text-center mt-6">
            <button
              onClick={() => onComplete()}
              disabled={isProcessing}
              className="text-gray-400 hover:text-white text-sm transition-colors duration-200 disabled:opacity-50"
            >
              ← Go Back
            </button>
          </div>
        )}
      </div>

      {/* Plan Details Modal */}
      {showDetailsModal && detailsPlan && (
        <Modal
          isOpen={showDetailsModal}
          onClose={() => {
            setShowDetailsModal(false);
            setDetailsPlan(null);
          }}
          type="crop"
        >
          <div className="dashboard-theme flex flex-col gap-4 sm:gap-6 w-full max-h-[85vh] overflow-y-auto py-4 sm:py-6 px-4 sm:px-6 md:px-8">
            <div className="flex items-center justify-between mb-3 sm:mb-4 relative">
              <div className="flex items-center gap-3 sm:gap-4 flex-1">
                <div className={`p-2 sm:p-3 rounded-xl ${detailsPlan.plan_name.toLowerCase() === 'free'
                  ? 'bg-gray-700/50 text-dashboard-muted'
                  : 'bg-dashboard-accent/20 text-dashboard-accent'
                  }`}>
                  {getPlanIcon(detailsPlan.plan_name)}
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                    {detailsPlan.plan_name} Plan
                  </h2>
                  <p className="text-xs sm:text-sm text-dashboard-muted uppercase tracking-wider">
                    {detailsPlan.duration}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setDetailsPlan(null);
                }}
                className="absolute top-0 right-0 text-dashboard-muted hover:text-dashboard transition-colors flex-shrink-0 z-10 p-1"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            {/* Price Section */}
            <div className="bg-dashboard-bg rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white">
                  ${formatCost(detailsPlan.cost)}
                </span>
                {detailsPlan.plan_name.toLowerCase() !== 'free' && (
                  <span className="text-dashboard-muted text-sm sm:text-base md:text-lg">
                    /{detailsPlan.duration === 'monthly' ? 'mo' : 'yr'}
                  </span>
                )}
              </div>
              {detailsPlan.duration === 'yearly' && (
                <p className="text-xs sm:text-sm text-dashboard-muted">
                  ${formatCost((parseInt(detailsPlan.cost) / 12).toFixed(0))} per month
                </p>
              )}
            </div>

            {/* Key Features */}
            <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-3 sm:mb-4">Key Features</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {detailsPlan.songs_quota && (
                  <div className="flex items-center gap-3 p-3 sm:p-4 bg-dashboard-bg rounded-lg">
                    <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-dashboard-accent/20 rounded flex items-center justify-center">
                      <Check className="w-3 h-3 sm:w-4 sm:h-4 text-dashboard-accent" />
                    </div>
                    <span className="text-white font-medium text-sm sm:text-base">
                      {detailsPlan.songs_quota} Songs
                    </span>
                  </div>
                )}
                {detailsPlan.ai_guide_quota && (
                  <div className="flex items-center gap-3 p-3 sm:p-4 bg-dashboard-bg rounded-lg">
                    <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-dashboard-accent/20 rounded flex items-center justify-center">
                      <Check className="w-3 h-3 sm:w-4 sm:h-4 text-dashboard-accent" />
                    </div>
                    <span className="text-white font-medium text-sm sm:text-base">
                      {detailsPlan.ai_guide_quota} AI Guides
                    </span>
                  </div>
                )}
                {detailsPlan.max_devices && (
                  <div className="flex items-center gap-3 p-3 sm:p-4 bg-dashboard-bg rounded-lg">
                    <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-dashboard-accent/20 rounded flex items-center justify-center">
                      <Check className="w-3 h-3 sm:w-4 sm:h-4 text-dashboard-accent" />
                    </div>
                    <span className="text-white font-medium text-sm sm:text-base">
                      Up to {detailsPlan.max_devices} Devices
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* All Features */}
            {parseFeatures(detailsPlan.features).length > 0 && (
              <div className="mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-3 sm:mb-4">All Features</h3>
                <div className="space-y-2 sm:space-y-3 bg-dashboard-bg rounded-lg p-3 sm:p-4">
                  {parseFeatures(detailsPlan.features).map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 sm:gap-3"
                    >
                      <div className="flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 mt-0.5 bg-dashboard-accent/20 rounded flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-dashboard-accent" />
                      </div>
                      <span className="text-dashboard-muted text-xs sm:text-sm leading-relaxed">
                        {typeof feature === 'object' ? feature.feature : feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-gray-700">
              <Button
                btnText="Close"
                variant="secondary"
                size="medium"
                onClickHandler={() => {
                  setShowDetailsModal(false);
                  setDetailsPlan(null);
                }}
                className="w-full sm:flex-1"
              />
              <Button
                btnText={selectedPlan === detailsPlan.documentId ? "Selected" : "Select This Plan"}
                variant="primary"
                size="medium"
                onClickHandler={() => {
                  handlePlanSelect(detailsPlan.documentId);
                  setShowDetailsModal(false);
                  setDetailsPlan(null);
                }}
                className="w-full sm:flex-1"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.5);
        }
      `}</style>
    </div>
  );
};

const SubscriptionPlans = (props: SubscriptionPlansProps) => {
  if (!MUSIC_SUBSCRIPTION_FLOWS_ENABLED) return <MusicSubscriptionUnavailable />;
  return <ActiveSubscriptionPlans {...props} />;
};

export default SubscriptionPlans;

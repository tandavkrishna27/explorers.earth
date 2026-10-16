import { useState, useCallback } from "react";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { EarthLoader } from "../../../components/EarthLoader";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import Accordion from "../../../components/ui/Accordian";
import useAuthStore from "../../../store/store";
import { MUSIC_SUBSCRIPTION_FLOWS_ENABLED } from "../../../components/MusicSubscriptionContainment";
import { isFreePlan } from "../../../services/paymentService";
import { Check, Sparkles, Zap, Crown, X, AlertCircle, Package } from "lucide-react";
import { getSubscriptionPlans, getSubscriptionPlanById, getUserSubscriptionPlans, getSongLimits, updateSongLimit as updateSongLimitAPI, createSongLimit, createUserSubscriptionPlan } from "../../../services/subscriptionService";


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

// Loading Placeholder Component
const LoadingPlaceholder = (_props?: { message?: string }) => (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
        <EarthLoader context="general" size="small" />
    </div>
);

// Error Placeholder Component
const ErrorPlaceholder = ({ message = "Failed to load data", onRetry }: { message?: string; onRetry?: () => void }) => (
    <div className="flex flex-col items-center justify-center py-8 gap-4">
        <div className="p-3 rounded-full bg-red-500/20 border border-red-500/30">
            <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        <div className="text-center">
            <p className="text-red-400 font-medium mb-1">{message}</p>
            <p className="text-gray-500 text-sm">Please check your connection and try again</p>
        </div>
        {onRetry && (
            <Button
                btnText="Retry"
                variant="secondary"
                size="small"
                onClickHandler={onRetry}
                className="flex items-center gap-2"
            />
        )}
    </div>
);

// Empty State Placeholder Component
const EmptyPlaceholder = ({ title, message, icon }: { title: string; message: string; icon?: React.ReactNode }) => (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
        <div className="p-3 rounded-full bg-gray-700/50 border border-gray-600">
            {icon || <Package className="w-6 h-6 text-gray-400" />}
        </div>
        <div className="text-center">
            <p className="text-dashboard font-medium mb-1">{title}</p>
            <p className="text-gray-400 text-sm">{message}</p>
        </div>
    </div>
);

const BillingTab = () => {
    const { user: authUser } = useAuthStore();
    const navigate = useNavigate();
    const [showPlanDetailsModal, setShowPlanDetailsModal] = useState(false);
    const [selectedPlanDetails, setSelectedPlanDetails] = useState<SubscriptionPlan | null>(null);
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

    // Track which accordions have been opened (for lazy loading)
    const [hasOpenedUsageDashboard, setHasOpenedUsageDashboard] = useState(false);
    const [hasOpenedCurrentPlan, setHasOpenedCurrentPlan] = useState(false);
    const [hasOpenedBrowsePlans, setHasOpenedBrowsePlans] = useState(false);

    // The Strapi read that used to be here fetched username, email and
    // razorpay_customer_id on every render into `_userData` and **never read it** - the
    // underscore was the only hint. It is deleted rather than ported: there is nothing to
    // port a read to when nothing consumes it.

    // Query subscription plans - enabled when Usage Dashboard or Current Plan is opened
    const { data: subscriptionData, isLoading: subscriptionsLoading, error: subscriptionsError, refetch: refetchSubscriptions } = useReactQuery({
        queryKey: ['userSubscriptionPlans', authUser?.documentId],
        queryFn: () => getUserSubscriptionPlans(authUser!.documentId),
        enabled: !!authUser?.documentId && (hasOpenedUsageDashboard || hasOpenedCurrentPlan),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    // Get latest subscription
    const activeSubscription = subscriptionData && subscriptionData.length > 0
        ? [...subscriptionData].sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0]
        : null;

    // Query plan details - enabled when Current Plan or Usage Dashboard is opened AND we have a plan_id
    const { data: planDetailsData, isLoading: planDetailsLoading, error: planDetailsError, refetch: refetchPlanDetails } = useReactQuery({
        queryKey: ['subscriptionPlan', activeSubscription?.plan_id],
        queryFn: () => getSubscriptionPlanById(activeSubscription!.plan_id),
        enabled: !!activeSubscription?.plan_id && (hasOpenedUsageDashboard || hasOpenedCurrentPlan),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    // Query all plans - enabled when Browse Plans is opened
    const { data: allPlansData, isLoading: allPlansLoading, error: allPlansError, refetch: refetchAllPlans } = useReactQuery({
        queryKey: ['subscriptionPlans'],
        queryFn: getSubscriptionPlans,
        enabled: hasOpenedBrowsePlans,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    // Query song limits - enabled when Usage Dashboard is opened
    const { data: songLimitsData, isLoading: songLimitsLoading, error: songLimitsError, refetch: refetchSongLimits } = useReactQuery({
        queryKey: ['songLimits', authUser?.username],
        queryFn: () => getSongLimits(authUser!.username),
        enabled: !!authUser?.username && hasOpenedUsageDashboard,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const songRequestsCount = songLimitsData?.[0]?.song_requests || 0;
    const guideRequestsCount = songLimitsData?.[0]?.ai_guide_requests || 0;
    const planDetails: SubscriptionPlan | null = planDetailsData || null;
    const songsQuota = typeof planDetails?.songs_quota === 'string' ? parseInt(planDetails.songs_quota, 10) || 0 : (planDetails?.songs_quota as number | undefined) ?? 0;
    const aiGuideQuota = typeof planDetails?.ai_guide_quota === 'string' ? parseInt(planDetails.ai_guide_quota, 10) || 0 : (planDetails?.ai_guide_quota as number | undefined) ?? 0;

    // Calculate plan expiry
    const calculatePlanExpiry = () => {
        if (!activeSubscription?.end_date) return null;
        const today = new Date();
        const endDate = new Date(activeSubscription.end_date);
        const startDate = new Date(activeSubscription.start_date);
        if (endDate < today) return { expired: true };
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const diffMonths = Math.floor(diffDays / 30);
        const remainingDays = diffDays % 30;
        const totalDuration = endDate.getTime() - startDate.getTime();
        const totalDays = Math.ceil(totalDuration / (1000 * 60 * 60 * 24));
        const elapsedDays = totalDays - diffDays;
        const progressPercentage = (elapsedDays / totalDays) * 100;
        return { expired: false, endDate, diffDays, diffMonths, remainingDays, progressPercentage: Math.min(progressPercentage, 100), isExpiringSoon: diffDays <= 7 };
    };

    const planExpiryInfo = calculatePlanExpiry();
    const allPlans: SubscriptionPlan[] = allPlansData || [];
    const hasActiveNonExpiredPlan = activeSubscription && planExpiryInfo && !planExpiryInfo.expired;
    const otherPlans = hasActiveNonExpiredPlan ? allPlans.filter(plan => plan.documentId !== activeSubscription?.plan_id) : allPlans;

    // Accordion open handlers
    const handleUsageDashboardOpen = useCallback((isOpen: boolean) => {
        if (isOpen && !hasOpenedUsageDashboard) {
            setHasOpenedUsageDashboard(true);
        }
    }, [hasOpenedUsageDashboard]);

    const handleCurrentPlanOpen = useCallback((isOpen: boolean) => {
        if (isOpen && !hasOpenedCurrentPlan) {
            setHasOpenedCurrentPlan(true);
        }
    }, [hasOpenedCurrentPlan]);

    const handleBrowsePlansOpen = useCallback((isOpen: boolean) => {
        if (isOpen && !hasOpenedBrowsePlans) {
            setHasOpenedBrowsePlans(true);
        }
    }, [hasOpenedBrowsePlans]);

    const parseFeatures = (features: Array<{ feature: string }> | string): Array<{ feature: string }> => {
        if (Array.isArray(features)) return features;
        if (typeof features === 'string') { try { const parsed = JSON.parse(features); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
        return [];
    };

    const formatCost = (cost: string) => parseInt(cost).toLocaleString();
    const getPlanIcon = (planName: string) => {
        if (planName.toLowerCase() === 'free') return <Sparkles className="w-5 h-5" />;
        if (planName.toLowerCase() === 'paid') return <Crown className="w-5 h-5" />;
        return <Zap className="w-5 h-5" />;
    };

    const getPlanHierarchyValue = (plan: SubscriptionPlan): number => {
        const planName = plan.plan_name.toLowerCase();
        const duration = plan.duration.toLowerCase();
        const isPro = planName.includes('pro');
        if (planName === 'free') return 1;
        if (!isPro && duration === 'monthly') return 2;
        if (isPro && duration === 'monthly') return 3;
        if (!isPro && duration === 'yearly') return 4;
        if (isPro && duration === 'yearly') return 5;
        return 0;
    };

    const isUpgrade = (plan: SubscriptionPlan): boolean => {
        if (!planDetails) return true;
        return getPlanHierarchyValue(plan) > getPlanHierarchyValue(planDetails);
    };

    const handleViewPlanDetails = (plan: SubscriptionPlan) => { setSelectedPlanDetails(plan); setShowPlanDetailsModal(true); };

    const calculateSubscriptionDates = (duration: string) => {
        const startDate = new Date();
        const endDate = new Date();
        if (duration === 'monthly') endDate.setMonth(endDate.getMonth() + 1);
        else if (duration === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
        return { start_date: startDate.toISOString(), end_date: endDate.toISOString() };
    };

    const handleUpgrade = async (plan: SubscriptionPlan) => {
        if (!authUser?.id || !authUser?.documentId) { toast.error("User information not available"); return; }
        // Step 9. This was the one subscription entrance still writing to Strapi. The other
        // two - Checkout and SubscriptionPlans - are already unreachable behind
        // MUSIC_SUBSCRIPTION_FLOWS_ENABLED, and a paid plan here navigates into Checkout,
        // which refuses. Only the free-plan branch escaped, so it set is_subscribed on a
        // backend being retired while the paid path next to it was closed.
        //
        // This applies the containment that is already in force; it does not decide D1.
        // There is no canonical subscription state to port to - updateAccountInputSchema has
        // no is_subscribed - so deciding what a subscription means canonically is the
        // owner's call, and it cannot be made by writing to Strapi in the meantime.
        if (!MUSIC_SUBSCRIPTION_FLOWS_ENABLED) {
            toast.error("Subscription changes are temporarily unavailable.");
            return;
        }
        if (!isFreePlan(plan)) { navigate('/checkout', { state: { plan, fromSettings: true } }); return; }
        try {
            const { start_date, end_date } = calculateSubscriptionDates(plan.duration);
            const subscriptionResponse = await createUserSubscriptionPlan({ user_id: authUser.documentId, plan_id: plan.documentId, start_date, end_date });
            if (!subscriptionResponse) throw new Error("Failed to create subscription entry");
            await refetchSubscriptions();
            await refetchPlanDetails();
            if (authUser?.username) {
                try {
                    const songLimitResult = await refetchSongLimits();
                    const songLimitRecord = songLimitResult?.data?.[0];
                    if (songLimitRecord?.documentId) {
                        await updateSongLimitAPI(songLimitRecord.documentId, { song_requests: 0, ai_guide_requests: 0 });
                        await refetchSongLimits();
                    } else {
                        await createSongLimit({ username: authUser.username, song_requests: 0, ai_guide_requests: 0 });
                        await refetchSongLimits();
                    }
                } catch { /* ignore */ }
            }
            toast.success("Subscription created successfully!");
        } catch (error: any) { toast.error(error.message || "Failed to upgrade subscription."); }
    };

    // Determine loading/error states for each accordion
    const isUsageDashboardLoading = hasOpenedUsageDashboard && (subscriptionsLoading || planDetailsLoading || songLimitsLoading);
    const isCurrentPlanLoading = hasOpenedCurrentPlan && (subscriptionsLoading || planDetailsLoading);
    const isBrowsePlansLoading = hasOpenedBrowsePlans && allPlansLoading;

    const hasUsageDashboardError = hasOpenedUsageDashboard && (subscriptionsError || planDetailsError || songLimitsError);
    const hasCurrentPlanError = hasOpenedCurrentPlan && (subscriptionsError || planDetailsError);
    const hasBrowsePlansError = hasOpenedBrowsePlans && allPlansError;

    // Render Usage Dashboard content
    const renderUsageDashboardContent = () => {
        // Not yet opened - show prompt
        if (!hasOpenedUsageDashboard) {
            return <EmptyPlaceholder title="Click to view" message="Open this section to see your usage statistics" />;
        }

        // Loading state
        if (isUsageDashboardLoading) {
            return <LoadingPlaceholder message="Loading usage data..." />;
        }

        // Error state
        if (hasUsageDashboardError) {
            return <ErrorPlaceholder message="Failed to load usage data" onRetry={() => {
                refetchSubscriptions();
                refetchPlanDetails();
                refetchSongLimits();
            }} />;
        }

        // No active subscription or expired
        if (!activeSubscription || !planExpiryInfo || planExpiryInfo.expired || !planDetails) {
            return (
                <EmptyPlaceholder
                    title="No Active Plan"
                    message={!activeSubscription ? "You don't have an active subscription plan." : "Your subscription plan has expired."}
                    icon={<AlertCircle className="w-6 h-6 text-orange-400" />}
                />
            );
        }

        // Has active subscription - show usage stats
        return (
            <div className="bg-dashboard-sidebar rounded-xl">
                {planExpiryInfo.isExpiringSoon && (
                    <div className="mb-4">
                        <span className="px-3 py-1 bg-orange-500/20 text-orange-400 text-xs font-semibold rounded-full border border-orange-500/30">Expiring Soon</span>
                    </div>
                )}
                <div className="p-1 sm:p-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                        {/* Time Remaining */}
                        <div className="relative bg-gradient-to-br from-dashboard-accent/20 to-dashboard-accent/10 backdrop-blur-md rounded-xl p-5 border border-dashboard-accent/30 shadow-lg shadow-dashboard-accent/10 hover:shadow-xl hover:shadow-dashboard-accent/20 hover:border-dashboard-accent/50 hover:scale-[1.02] transition-all duration-300 cursor-default group" style={{ boxShadow: 'inset 0 0 20px rgba(255,255,255,0.08)' }}>
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-2 rounded-lg bg-dashboard-accent/30 border border-dashboard-accent/40 group-hover:bg-dashboard-accent/40 transition-colors duration-300">
                                    <svg className="w-5 h-5 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <span className="text-xs text-dashboard-muted uppercase tracking-wider">Plan Validity</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="relative w-16 h-16">
                                    <svg className="w-16 h-16 transform -rotate-90">
                                        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" className="text-gray-700" />
                                        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray={`${(100 - (planExpiryInfo.progressPercentage || 0)) * 1.76} 176`} className={planExpiryInfo.isExpiringSoon ? 'text-orange-500' : 'text-blue-500'} strokeLinecap="round" />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-dashboard">{Math.round(100 - (planExpiryInfo.progressPercentage || 0))}%</span>
                                </div>
                                <div>
                                    <div className={`text-2xl font-bold ${planExpiryInfo.isExpiringSoon ? 'text-orange-400' : 'text-dashboard'}`}>
                                        {planExpiryInfo.diffMonths && planExpiryInfo.diffMonths > 0 ? `${planExpiryInfo.diffMonths}mo` : `${planExpiryInfo.diffDays ?? 0}d`}
                                    </div>
                                    <div className="text-xs text-dashboard-muted">{planExpiryInfo.endDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                </div>
                            </div>
                        </div>
                        {/* Song Requests */}
                        <div className="relative bg-gradient-to-br from-dashboard-accent/20 to-dashboard-accent/10 backdrop-blur-md rounded-xl p-5 border border-dashboard-accent/30 shadow-lg shadow-dashboard-accent/10 hover:shadow-xl hover:shadow-dashboard-accent/20 hover:border-dashboard-accent/50 hover:scale-[1.02] transition-all duration-300 cursor-default group" style={{ boxShadow: 'inset 0 0 20px rgba(255,255,255,0.08)' }}>
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-2.5 rounded-lg bg-dashboard-accent/30 border border-dashboard-accent/40 group-hover:bg-dashboard-accent/40 transition-colors duration-300">
                                    <svg className="w-5 h-5 text-dashboard-accent" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                    </svg>
                                </div>
                                <span className="text-xs text-dashboard-muted uppercase tracking-wider">Songs</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="relative w-16 h-16">
                                    <svg className="w-16 h-16 transform -rotate-90">
                                        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" className="text-gray-700" />
                                        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray={`${songsQuota > 0 ? Math.max((songRequestsCount / songsQuota) * 176, 8) : 8} 176`} className={songRequestsCount >= songsQuota && songsQuota > 0 ? 'text-red-500' : songsQuota > 0 && (songRequestsCount / songsQuota) >= 0.9 ? 'text-orange-500' : 'text-cyan-500'} strokeLinecap="round" />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-dashboard">{songsQuota > 0 ? Math.round((songRequestsCount / songsQuota) * 100) : 0}%</span>
                                </div>
                                <div>
                                    <div className={`text-2xl font-bold ${songRequestsCount >= songsQuota && songsQuota > 0 ? 'text-red-400' : 'text-dashboard'}`}>{songRequestsCount}<span className="text-sm text-dashboard-muted">/{songsQuota}</span></div>
                                    <div className="text-xs text-dashboard-muted">requests used</div>
                                </div>
                            </div>
                        </div>
                        {/* AI Guide Requests */}
                        {aiGuideQuota > 0 && (
                            <div className="relative bg-gradient-to-br from-dashboard-accent/20 to-dashboard-accent/10 backdrop-blur-md rounded-xl p-5 border border-dashboard-accent/30 shadow-lg shadow-dashboard-accent/10 hover:shadow-xl hover:shadow-dashboard-accent/20 hover:border-dashboard-accent/50 hover:scale-[1.02] transition-all duration-300 cursor-default group" style={{ boxShadow: 'inset 0 0 20px rgba(255,255,255,0.08)' }}>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-2 rounded-lg bg-dashboard-accent/30 border border-dashboard-accent/40 group-hover:bg-dashboard-accent/40 transition-colors duration-300">
                                        <svg className="w-5 h-5 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                        </svg>
                                    </div>
                                    <span className="text-xs text-dashboard-muted uppercase tracking-wider">AI Guides</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="relative w-16 h-16">
                                        <svg className="w-16 h-16 transform -rotate-90">
                                            <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" className="text-gray-700" />
                                            <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray={`${aiGuideQuota > 0 ? (guideRequestsCount / aiGuideQuota) * 176 : 0} 176`} className={guideRequestsCount >= aiGuideQuota && aiGuideQuota > 0 ? 'text-red-500' : aiGuideQuota > 0 && (guideRequestsCount / aiGuideQuota) >= 0.9 ? 'text-orange-500' : 'text-emerald-500'} strokeLinecap="round" />
                                        </svg>
                                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-dashboard">{aiGuideQuota > 0 ? Math.round((guideRequestsCount / aiGuideQuota) * 100) : 0}%</span>
                                    </div>
                                    <div>
                                        <div className={`text-2xl font-bold ${guideRequestsCount >= aiGuideQuota && aiGuideQuota > 0 ? 'text-red-400' : 'text-dashboard'}`}>{guideRequestsCount}<span className="text-sm text-dashboard-muted">/{aiGuideQuota}</span></div>
                                        <div className="text-xs text-dashboard-muted">guides generated</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Render Current Plan content
    const renderCurrentPlanContent = () => {
        // Not yet opened
        if (!hasOpenedCurrentPlan) {
            return <EmptyPlaceholder title="Click to view" message="Open this section to see your current plan details" />;
        }

        // Loading state
        if (isCurrentPlanLoading) {
            return <LoadingPlaceholder message="Loading plan details..." />;
        }

        // Error state
        if (hasCurrentPlanError) {
            return <ErrorPlaceholder message="Failed to load plan details" onRetry={() => {
                refetchSubscriptions();
                refetchPlanDetails();
            }} />;
        }

        // No active subscription or expired
        if (!activeSubscription || !planExpiryInfo || planExpiryInfo.expired) {
            return (
                <EmptyPlaceholder
                    title="No Active Plan"
                    message={!activeSubscription ? "You don't have an active subscription." : "Your subscription has expired. Browse plans below to renew."}
                    icon={<Package className="w-6 h-6 text-gray-400" />}
                />
            );
        }

        // No plan details
        if (!planDetails) {
            return <EmptyPlaceholder title="Plan Details Unavailable" message="Unable to load your plan details" />;
        }

        // Has active subscription - show plan details
        return (
            <div onClick={() => handleViewPlanDetails(planDetails)} className="relative bg-dashboard-sidebar rounded-xl p-4 sm:p-6 border border-dashboard-accent/50 cursor-pointer transition-all duration-300 hover:border-dashboard-accent">
                <div className="absolute -top-3 right-4 bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-green-300/50">Active</div>
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3 flex-1">
                                <div className={`p-2 rounded-xl ${planDetails.plan_name.toLowerCase() === 'free' ? 'bg-gray-700/50 text-gray-300' : 'bg-dashboard-accent/20 text-dashboard-accent'}`}>{getPlanIcon(planDetails.plan_name)}</div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-dashboard">{planDetails.plan_name}</h3>
                                        <p className="text-xs text-dashboard-muted uppercase tracking-wider">{planDetails.duration}</p>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-dashboard">₹{formatCost(planDetails.cost)}</span>
                                        {planDetails.plan_name.toLowerCase() !== 'free' && <span className="text-dashboard-muted text-sm sm:text-base lg:text-lg">/{planDetails.duration === 'monthly' ? 'mo' : 'yr'}</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mb-4 p-3 bg-dashboard-bg/50 rounded-lg">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><span className="text-dashboard-muted">Start Date:</span><p className="text-dashboard font-medium">{new Date(activeSubscription.start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p></div>
                                <div><span className="text-dashboard-muted">End Date:</span><p className="text-dashboard font-medium">{new Date(activeSubscription.end_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p></div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            {planDetails.songs_quota && (
                                <div className="flex items-center gap-2 p-2.5 bg-dashboard-bg/50 rounded-lg">
                                    <div className="flex-shrink-0 w-4 h-4 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-2.5 h-2.5 text-dashboard-accent" /></div>
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-dashboard bg-dashboard-muted border border-dashboard rounded-full shadow-md">{planDetails.songs_quota} Songs</span>
                                </div>
                            )}
                            {planDetails.ai_guide_quota && (
                                <div className="flex items-center gap-2 p-2.5 bg-dashboard-bg/50 rounded-lg">
                                    <div className="flex-shrink-0 w-4 h-4 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-2.5 h-2.5 text-dashboard-accent" /></div>
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-dashboard bg-dashboard-muted border border-dashboard rounded-full shadow-md">{planDetails.ai_guide_quota} AI Guides</span>
                                </div>
                            )}
                        </div>
                        <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                            <Button btnText="View Details" variant="secondary" size="small" onClickHandler={() => handleViewPlanDetails(planDetails)} className="w-full lg:w-auto" />
                        </div>
                    </div>
                    {parseFeatures(planDetails.features).length > 0 && (
                        <div className="flex-1">
                            <h4 className="text-xs font-semibold text-dashboard-muted uppercase tracking-wider mb-2">Features</h4>
                            <div className="space-y-1.5">
                                {parseFeatures(planDetails.features).map((feature, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                        <div className="flex-shrink-0 w-4 h-4 mt-0.5 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-2.5 h-2.5 text-dashboard-accent" /></div>
                                        <span className="text-dashboard-muted text-xs leading-relaxed">{typeof feature === 'object' ? feature.feature : feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Render Browse Plans content
    const renderBrowsePlansContent = () => {
        // Not yet opened
        if (!hasOpenedBrowsePlans) {
            return <EmptyPlaceholder title="Click to view" message="Open this section to browse available subscription plans" />;
        }

        // Loading state
        if (isBrowsePlansLoading) {
            return <LoadingPlaceholder message="Loading available plans..." />;
        }

        // Error state
        if (hasBrowsePlansError) {
            return <ErrorPlaceholder message="Failed to load plans" onRetry={() => refetchAllPlans()} />;
        }

        // No plans available
        if (!allPlans || allPlans.length === 0) {
            return <EmptyPlaceholder title="No Plans Available" message="There are no subscription plans available at this time" />;
        }

        // Show plans
        return (
            <>
                <div className="flex items-center justify-center mb-6">
                    <div className="flex items-center justify-center bg-dashboard-muted border border-dashboard font-poppins rounded-3xl mx-auto w-fit p-1">
                        <button onClick={() => setBillingPeriod('monthly')} className={`px-4 py-2 text-xs font-medium transition-all duration-300 whitespace-nowrap ${billingPeriod === 'monthly' ? 'bg-dashboard-accent rounded-2xl text-[var(--dash-accent-text)]' : 'bg-transparent rounded-2xl text-dashboard-muted hover:text-dashboard'}`}>Monthly</button>
                        <button onClick={() => setBillingPeriod('yearly')} className={`px-4 py-2 text-xs font-medium transition-all duration-300 whitespace-nowrap ${billingPeriod === 'yearly' ? 'bg-dashboard-accent rounded-2xl text-[var(--dash-accent-text)]' : 'bg-transparent rounded-2xl text-dashboard-muted hover:text-dashboard'}`}>Yearly</button>
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                    {otherPlans.filter(plan => plan.plan_name.toLowerCase() === 'free' || plan.duration.toLowerCase() === billingPeriod).map((plan) => {
                        const features = parseFeatures(plan.features);
                        const isFree = plan.plan_name.toLowerCase() === 'free';
                        const isYearly = plan.duration === 'yearly';
                        const canUpgrade = hasActiveNonExpiredPlan ? isUpgrade(plan) : true;
                        return (
                            <div key={plan.documentId} onClick={() => handleViewPlanDetails(plan)} className={`relative bg-dashboard-sidebar rounded-2xl p-4 sm:p-6 border-2 transition-all duration-300 ${canUpgrade ? 'border-dashboard hover:border-dashboard-accent/50 cursor-pointer opacity-100' : 'border-dashboard opacity-40 grayscale cursor-pointer'}`}>
                                {isYearly && <div className="absolute -top-3 right-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-yellow-300/50">Best Value</div>}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className={`p-2 rounded-xl ${isFree ? 'bg-dashboard-muted text-dashboard-light' : 'bg-dashboard-accent/20 text-dashboard-accent'}`}>{getPlanIcon(plan.plan_name)}</div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <h3 className="text-lg sm:text-xl font-bold text-dashboard">{plan.plan_name}</h3>
                                                <p className="text-xs text-dashboard-muted uppercase tracking-wider">{plan.duration}</p>
                                            </div>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-2xl sm:text-3xl font-bold text-dashboard">₹{formatCost(plan.cost)}</span>
                                                {!isFree && <span className="text-dashboard-muted text-sm sm:text-base">/{plan.duration === 'monthly' ? 'mo' : 'yr'}</span>}
                                            </div>
                                            {isYearly && <p className="text-xs text-dashboard-muted mt-0.5">₹{formatCost((parseInt(plan.cost) / 12).toFixed(0))} per month</p>}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    {plan.songs_quota && (
                                        <div className="flex items-center gap-2 p-2.5 bg-dashboard-bg/50 rounded-lg">
                                            <div className="flex-shrink-0 w-4 h-4 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-2.5 h-2.5 text-dashboard-accent" /></div>
                                            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-dashboard bg-dashboard-muted border border-dashboard rounded-full shadow-md">{plan.songs_quota} Songs</span>
                                        </div>
                                    )}
                                    {plan.ai_guide_quota && (
                                        <div className="flex items-center gap-2 p-2.5 bg-dashboard-bg/50 rounded-lg">
                                            <div className="flex-shrink-0 w-4 h-4 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-2.5 h-2.5 text-dashboard-accent" /></div>
                                            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-dashboard bg-dashboard-muted border border-dashboard rounded-full shadow-md">{plan.ai_guide_quota} AI Guides</span>
                                        </div>
                                    )}
                                </div>
                                {features.length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="text-xs font-semibold text-dashboard-muted uppercase tracking-wider mb-2">Features</h4>
                                        <div className="space-y-1.5">
                                            {features.slice(0, 3).map((feature, idx) => (
                                                <div key={idx} className="flex items-start gap-2">
                                                    <div className="flex-shrink-0 w-4 h-4 mt-0.5 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-2.5 h-2.5 text-dashboard-accent" /></div>
                                                    <span className="text-dashboard-muted text-xs leading-relaxed">{typeof feature === 'object' ? feature.feature : feature}</span>
                                                </div>
                                            ))}
                                            {features.length > 3 && <div className="flex items-center gap-2 pt-1"><span className="text-dashboard-muted text-xs font-medium">+{features.length - 3} more features</span></div>}
                                        </div>
                                    </div>
                                )}
                                <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                                    <Button btnText="View Details" variant="secondary" size="small" onClickHandler={() => handleViewPlanDetails(plan)} className="flex-1" />
                                    {canUpgrade && <Button btnText={hasActiveNonExpiredPlan ? "Upgrade" : "Subscribe"} variant="primary" size="small" onClickHandler={() => handleUpgrade(plan)} className="flex-1" />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </>
        );
    };

    return (
        <div className="space-y-4">
            {/* Usage Dashboard - Always visible */}
            <Accordion heading="Usage Dashboard" defaultOpen={false} onOpenChange={handleUsageDashboardOpen}>
                {renderUsageDashboardContent()}
            </Accordion>

            {/* Current Plan - Always visible */}
            <Accordion heading="Current Plan" defaultOpen={false} onOpenChange={handleCurrentPlanOpen}>
                {renderCurrentPlanContent()}
            </Accordion>

            {/* Browse Plans - Always visible */}
            <Accordion heading="Browse Plans" defaultOpen={false} onOpenChange={handleBrowsePlansOpen}>
                {renderBrowsePlansContent()}
            </Accordion>

            {/* Plan Details Modal */}
            {showPlanDetailsModal && selectedPlanDetails && (
                <Modal isOpen={showPlanDetailsModal} onClose={() => { setShowPlanDetailsModal(false); setSelectedPlanDetails(null); }} type="crop">
                    <div className="dashboard-theme flex flex-col gap-4 sm:gap-6 w-full max-h-[85vh] overflow-y-auto py-4 sm:py-6 px-4 sm:px-6 md:px-8">
                        <div className="flex items-center justify-between mb-3 sm:mb-4 relative">
                            <div className="flex items-center gap-3 sm:gap-4 flex-1">
                                <div className={`p-2 sm:p-3 rounded-xl ${selectedPlanDetails.plan_name.toLowerCase() === 'free' ? 'bg-gray-700/50 text-dashboard-muted' : 'bg-dashboard-accent/20 text-dashboard-accent'}`}>{getPlanIcon(selectedPlanDetails.plan_name)}</div>
                                <div>
                                    <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-dashboard">{selectedPlanDetails.plan_name} Plan</h2>
                                    <p className="text-xs sm:text-sm text-dashboard-muted uppercase tracking-wider">{selectedPlanDetails.duration}</p>
                                </div>
                            </div>
                            <button onClick={() => { setShowPlanDetailsModal(false); setSelectedPlanDetails(null); }} className="absolute top-0 right-0 text-dashboard-muted hover:text-dashboard transition-colors flex-shrink-0 z-10 p-1"><X className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                        </div>
                        <div className="bg-dashboard-bg rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-dashboard">₹{formatCost(selectedPlanDetails.cost)}</span>
                                {selectedPlanDetails.plan_name.toLowerCase() !== 'free' && <span className="text-dashboard-muted text-sm sm:text-base md:text-lg">/{selectedPlanDetails.duration === 'monthly' ? 'mo' : 'yr'}</span>}
                            </div>
                            {selectedPlanDetails.duration === 'yearly' && <p className="text-xs sm:text-sm text-dashboard-muted">₹{formatCost((parseInt(selectedPlanDetails.cost) / 12).toFixed(0))} per month</p>}
                        </div>
                        <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                            <h3 className="text-lg sm:text-xl font-semibold text-dashboard mb-3 sm:mb-4">Key Features</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {selectedPlanDetails.songs_quota && (
                                    <div className="flex items-center gap-3 p-3 sm:p-4 bg-dashboard-bg rounded-lg">
                                        <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-3 h-3 sm:w-4 sm:h-4 text-dashboard-accent" /></div>
                                        <span className="text-dashboard font-medium text-sm sm:text-base">{selectedPlanDetails.songs_quota} Songs</span>
                                    </div>
                                )}
                                {selectedPlanDetails.ai_guide_quota && (
                                    <div className="flex items-center gap-3 p-3 sm:p-4 bg-dashboard-bg rounded-lg">
                                        <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-3 h-3 sm:w-4 sm:h-4 text-dashboard-accent" /></div>
                                        <span className="text-dashboard font-medium text-sm sm:text-base">{selectedPlanDetails.ai_guide_quota} AI Guides</span>
                                    </div>
                                )}
                                {selectedPlanDetails.max_devices && (
                                    <div className="flex items-center gap-3 p-3 sm:p-4 bg-dashboard-bg rounded-lg">
                                        <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-3 h-3 sm:w-4 sm:h-4 text-dashboard-accent" /></div>
                                        <span className="text-dashboard font-medium text-sm sm:text-base">Up to {selectedPlanDetails.max_devices} Devices</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        {parseFeatures(selectedPlanDetails.features).length > 0 && (
                            <div className="mb-4 sm:mb-6">
                                <h3 className="text-lg sm:text-xl font-semibold text-dashboard mb-3 sm:mb-4">All Features</h3>
                                <div className="bg-dashboard-bg rounded-lg p-3 sm:p-4">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
                                        {parseFeatures(selectedPlanDetails.features).map((feature, idx) => (
                                            <div key={idx} className="flex items-start gap-2 sm:gap-3">
                                                <div className="flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 mt-0.5 bg-dashboard-accent/20 rounded flex items-center justify-center"><Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-dashboard-accent" /></div>
                                                <span className="text-dashboard-muted text-xs sm:text-sm leading-relaxed">{typeof feature === 'object' ? feature.feature : feature}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default BillingTab;

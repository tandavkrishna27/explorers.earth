import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { EarthLoader } from '../components/EarthLoader';
import { Check, ArrowLeft, CreditCard, AlertCircle, Shield, Lock, Zap, Calendar, Users, Sparkles } from 'lucide-react';
import useAuthStore from '../store/store';
import {
  createRazorpayOrder,
  verifyPayment,
  initializeRazorpayCheckout,
  createRazorpaySubscription,
  verifySubscription,
  initializeRazorpaySubscriptionCheckout,
  isFreePlan,
  getRazorpayKeyId,
} from '../services/paymentService';
import PaymentModeToggle from '../components/PaymentModeToggle';
import axios from 'axios';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { createUserSubscriptionPlan, getSongLimits, updateSongLimit as updateSongLimitAPI, createSongLimit } from '../services/subscriptionService';
import { MUSIC_SUBSCRIPTION_FLOWS_ENABLED, MusicSubscriptionUnavailable } from '../components/MusicSubscriptionContainment';


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

interface FormData {
  accountName: string;
  accountType: string;
  username: string;
  bio?: string;
  mobile_number: string;
  address?: string;
  streetName?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  primaryAddress: string;
}

interface LocationState {
  plan: SubscriptionPlan;
  fromMusic?: boolean;
  fromSettings?: boolean;
  fromOnboarding?: boolean;
  formData?: FormData;
}

const ActiveCheckout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const { user: authUser } = useAuthStore();

  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'DEV' | 'PROD'>('DEV');


  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!state?.plan) {
      toast.error('No plan selected. Redirecting to subscription plans...');
      navigate('/subscription-plans');
      return;
    }

    if (!authUser?.id || !authUser?.documentId) {
      toast.error('User information not available');
      navigate('/subscription-plans');
      return;
    }

    setPlan(state.plan);
  }, [state, authUser, navigate]);

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
      end_date: endDate.toISOString(),
    };
  };

  // Derive the correct API duration based on plan_name and duration
  // PRO plans may have plan_name containing "pro" (e.g., "Paid (pro) Plan")
  // We need to convert this to "monthly_pro" or "yearly_pro" for the API
  const getApiDuration = (planName: string, duration: string): string => {
    const isPro = planName.toLowerCase().includes('pro');
    if (isPro) {
      if (duration === 'monthly') return 'monthly_pro';
      if (duration === 'yearly') return 'yearly_pro';
    }
    return duration;
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

  // Handle onboarding completion and subscription activation.
  const handleOnboardingCompletion = async (formData: FormData, razorpayCustomerId?: string) => {
    if (!authUser?.id || !authUser?.documentId) {
      throw new Error('User information not available');
    }

    const token = localStorage.getItem('qrtoken');
    if (!token) {
      throw new Error('Authentication token not found');
    }

    // Check if account already exists
    let accountDocId: string | null = null;
    try {
      const existingAccountCheck = await axios.get(
        `${import.meta.env.VITE_REST_API_URL}/accounts?filters%5Busers_permissions_users%5D%5BdocumentId%5D%5B%24eq%5D=${authUser.documentId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (existingAccountCheck.data?.data?.length > 0) {
        accountDocId = existingAccountCheck.data.data[0]?.documentId;
      }
    } catch (checkError) {
      console.warn("Could not verify existing accounts:", checkError);
    }

    // Create account only if it doesn't exist
    if (!accountDocId) {
      if (!formData.primaryAddress || formData.primaryAddress.trim() === "") {
        throw new Error('Primary address is required');
      }

      // Account creation on the checkout path was a Strapi createAccount. Canonically the
      // account is provisioned at authentication, so there is nothing for this to create;
      // the refusal above is the whole behaviour.
      subscriptionWriteUnavailable();
    }

    // Update is_subscribed to true and razorpay_customer_id if available
    const userUpdateData: any = {
      is_subscribed: true,
    };

    if (razorpayCustomerId) {
      userUpdateData.razorpay_customer_id = razorpayCustomerId;
    }

    subscriptionWriteUnavailable();

  };

  // Create subscription after successful payment
  const createSubscription = async (razorpayData?: {
    razorpay_sub_id?: string;
    razorpay_plan_id?: string;
    razorpay_customer_id?: string;
  }) => {
    if (!plan || !authUser) {
      throw new Error('Plan or user information missing');
    }

    const { start_date, end_date } = calculateSubscriptionDates(plan.duration);

    // Step 1: Create subscription entry
    const subscriptionData: any = {
      user_id: authUser.documentId,
      plan_id: plan.documentId,
      start_date: start_date,
      end_date: end_date,
    };

    // Add optional Razorpay fields if provided
    if (razorpayData?.razorpay_sub_id) {
      subscriptionData.razorpay_sub_id = razorpayData.razorpay_sub_id;
    }
    if (razorpayData?.razorpay_plan_id) {
      subscriptionData.razorpay_plan_id = razorpayData.razorpay_plan_id;
    }
    if (razorpayData?.razorpay_customer_id) {
      subscriptionData.razorpay_customer_id = razorpayData.razorpay_customer_id;
    }

    const subscriptionResponse = await createUserSubscriptionPlan(subscriptionData);

    if (!subscriptionResponse) {
      throw new Error('Failed to create subscription entry');
    }

    // Step 2: Create or reset song_requests and ai_guide_requests for the user
    if (authUser?.username) {
      try {
        // Get the songLimit record for this user using API
        const songLimits = await getSongLimits(authUser.username);
        const songLimitRecord = songLimits?.[0];

        if (songLimitRecord?.documentId) {
          // Record exists - reset to 0
          await updateSongLimitAPI(songLimitRecord.documentId, {
            song_requests: 0,
            ai_guide_requests: 0,
          });
        } else {
          // Record doesn't exist - create a new one with default values
          await createSongLimit({
            username: authUser.username,
            song_requests: 0,
            ai_guide_requests: 0,
          });
        }
      } catch (error) {
        // If getSongLimits fails, try to create a new record
        console.log('Song limit not found, attempting to create...', error);
        try {
          await createSongLimit({
            username: authUser.username,
            song_requests: 0,
            ai_guide_requests: 0,
          });
        } catch (createError) {
          console.log('Could not create song limit record:', createError);
        }
      }
    }

    // Step 3: Update is_subscribed to true and razorpay_customer_id (only if not from onboarding)
    if (!state?.fromOnboarding) {
      const userUpdateData: any = {
        is_subscribed: true,
      };

      // Update razorpay_customer_id if available
      if (razorpayData?.razorpay_customer_id) {
        userUpdateData.razorpay_customer_id = razorpayData.razorpay_customer_id;
      }

      subscriptionWriteUnavailable();
    }

    // Step 4: Store selected plan in localStorage
    localStorage.setItem('selectedSubscriptionPlan', plan.documentId);
  };

  // Helper function to format contact number for Razorpay
  // Razorpay expects: Indian numbers as 10 digits, international as E.164 without + or with country code
  const formatContactForRazorpay = (phoneNumber: string): string | undefined => {
    if (!phoneNumber || phoneNumber.trim() === '') {
      return undefined;
    }

    try {
      const parsed = parsePhoneNumberFromString(phoneNumber);
      if (parsed && parsed.isValid()) {
        const countryCode = parsed.country;
        const nationalNumber = parsed.nationalNumber;

        // For Indian numbers, Razorpay prefers 10 digits without country code
        if (countryCode === 'IN' && nationalNumber.length === 10) {
          return nationalNumber;
        }

        // For other countries, use E.164 format but remove the + sign
        // Razorpay accepts format like "919876543210" (country code + number)
        const e164 = parsed.format('E.164');
        if (e164) {
          // Remove the + sign if present
          const formatted = e164.replace(/^\+/, '');
          // Ensure it's only digits (Razorpay requirement)
          if (/^\d+$/.test(formatted) && formatted.length >= 10) {
            return formatted;
          }
        }
      }
    } catch (error) {
      console.warn('Could not parse phone number:', error);
    }

    // Fallback: clean the number (remove spaces, dashes, parentheses, +)
    const cleaned = phoneNumber.replace(/[\s\-()+]/g, '');

    // Validate: must be all digits and at least 10 characters
    if (/^\d{10,}$/.test(cleaned)) {
      return cleaned;
    }

    // If validation fails, return undefined to avoid sending invalid data
    console.warn('Invalid phone number format for Razorpay:', phoneNumber);
    return undefined;
  };

  // Helper function to get contact number for Razorpay prefill
  const getContactNumber = async (): Promise<string | undefined> => {
    let rawPhoneNumber: string | undefined;

    // First, try to get from formData if from onboarding
    if (state?.fromOnboarding && state?.formData?.mobile_number) {
      rawPhoneNumber = state.formData.mobile_number;
    } else {
      // Try to fetch from account if it exists
      try {
        const token = localStorage.getItem('qrtoken');
        if (token && authUser?.documentId) {
          const accountResponse = await axios.get(
            `${import.meta.env.VITE_REST_API_URL}/accounts?filters%5Busers_permissions_users%5D%5BdocumentId%5D%5B%24eq%5D=${authUser.documentId}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (accountResponse.data?.data?.[0]?.mobile_number) {
            rawPhoneNumber = accountResponse.data.data[0].mobile_number;
          }
        }
      } catch (error) {
        console.warn('Could not fetch account mobile number:', error);
      }
    }

    if (!rawPhoneNumber) {
      return undefined;
    }

    // Format the phone number for Razorpay
    return formatContactForRazorpay(rawPhoneNumber);
  };

  // Handle payment for paid plans
  const handlePayment = async () => {
    if (!plan || !authUser) {
      setError('Plan or user information missing');
      return;
    }

    // Only use subscription flow for monthly and yearly plans
    // Support both standard plans (monthly, yearly) and PRO plans (monthly_pro, yearly_pro)
    const isSubscriptionPlan = ['monthly', 'yearly', 'monthly_pro', 'yearly_pro'].includes(plan.duration);

    setIsPaymentProcessing(true);
    setError(null);

    try {
      // Get contact number for Razorpay prefill
      const contactNumber = await getContactNumber();

      // Store verification result for use in onboarding
      let verificationResult: any = null;

      if (isSubscriptionPlan) {
        // Use Razorpay Subscriptions API
        // Step 1: Create Razorpay subscription
        const customerDetails: any = {
          name: authUser.username || '',
          email: authUser.email || '',
        };

        // Only include contact if it's valid (required for account validation)
        if (contactNumber) {
          customerDetails.contact = contactNumber;
        }

        const subscription = await createRazorpaySubscription({
          planId: plan.documentId,
          userId: authUser.documentId,
          duration: getApiDuration(plan.plan_name, plan.duration),
          customerDetails,
          mode: paymentMode,
        });

        // Step 2: Initialize Razorpay subscription checkout
        const razorpayKeyId = getRazorpayKeyId(paymentMode);
        if (!razorpayKeyId) {
          throw new Error(`Razorpay key ID for ${paymentMode} mode not configured`);
        }

        const prefillData: any = {
          name: authUser.username || '',
          email: authUser.email || '',
        };

        // Add contact if available (required for account validation)
        if (contactNumber) {
          prefillData.contact = contactNumber;
        }

        const paymentResponse = await initializeRazorpaySubscriptionCheckout({
          key: razorpayKeyId,
          subscription_id: subscription.subscriptionId,
          name: 'explorers',
          description: `${plan.plan_name} Plan - ${plan.duration}`,
          prefill: prefillData,
          theme: {
            color: '#8B5CF6',
          },
          modal: {
            ondismiss: () => {
              setIsPaymentProcessing(false);
              toast.info('Payment cancelled');
            },
          },
          handler: () => { }, // Handler is created internally by the service
        });

        // Step 3: Verify subscription payment with backend
        verificationResult = await verifySubscription({
          subscriptionId: paymentResponse.razorpay_subscription_id,
          paymentId: paymentResponse.razorpay_payment_id,
          signature: paymentResponse.razorpay_signature,
          planId: plan.documentId,
          userId: authUser.documentId,
          duration: getApiDuration(plan.plan_name, plan.duration),
          mode: paymentMode,
        });

        if (!verificationResult.success) {
          throw new Error(verificationResult.error || 'Subscription verification failed');
        }

        // Step 4: Create subscription in Strapi after successful verification with Razorpay data
        setIsProcessing(true);
        const razorpayCustomerId = verificationResult.razorpayCustomerId || undefined;
        await createSubscription({
          razorpay_sub_id: verificationResult.razorpaySubscriptionId || paymentResponse.razorpay_subscription_id,
          razorpay_plan_id: verificationResult.razorpayPlanId || undefined,
          razorpay_customer_id: razorpayCustomerId,
        });
      } else {
        // Fallback to order flow for other plan types
        // Step 1: Create Razorpay order
        const amount = parseInt(plan.cost) * 100; // Convert to paise
        const order = await createRazorpayOrder({
          planId: plan.documentId,
          userId: authUser.documentId,
          amount: amount,
          currency: 'INR',
          mode: paymentMode,
        });

        // Step 2: Initialize Razorpay checkout
        const razorpayKeyId = getRazorpayKeyId(paymentMode);
        if (!razorpayKeyId) {
          throw new Error(`Razorpay key ID for ${paymentMode} mode not configured`);
        }

        const prefillData: any = {
          name: authUser.username || '',
          email: authUser.email || '',
        };

        // Add contact if available (required for account validation)
        if (contactNumber) {
          prefillData.contact = contactNumber;
        }

        const paymentResponse = await initializeRazorpayCheckout({
          key: razorpayKeyId,
          amount: order.amount,
          currency: order.currency,
          name: 'explorers',
          description: `${plan.plan_name} Plan - ${plan.duration}`,
          order_id: order.orderId,
          prefill: prefillData,
          theme: {
            color: '#8B5CF6',
          },
          modal: {
            ondismiss: () => {
              setIsPaymentProcessing(false);
              toast.info('Payment cancelled');
            },
          },
          handler: () => { }, // Handler is created internally by the service
        } as any);

        // Step 3: Verify payment with backend
        verificationResult = await verifyPayment({
          orderId: paymentResponse.razorpay_order_id,
          paymentId: paymentResponse.razorpay_payment_id,
          signature: paymentResponse.razorpay_signature,
          planId: plan.documentId,
          userId: authUser.documentId,
          mode: paymentMode,
        });

        if (!verificationResult.success) {
          throw new Error(verificationResult.error || 'Payment verification failed');
        }

        // Step 4: Create subscription after successful payment verification
        // Order flow doesn't have Razorpay subscription data, so pass null
        setIsProcessing(true);
        await createSubscription();
      }

      // Step 5: Handle onboarding completion if from onboarding
      if (state?.fromOnboarding && state?.formData) {
        // Get customer_id from verification result if available (for subscription flow)
        const customerId = isSubscriptionPlan && verificationResult
          ? verificationResult.razorpayCustomerId || undefined
          : undefined;
        await handleOnboardingCompletion(state.formData, customerId);
        toast.success('Payment successful! Account created and subscription activated.');
        navigate('/home');
        return;
      }

      toast.success('Payment successful! Subscription activated.');

      // Navigate based on where user came from
      if (state?.fromMusic) {
        navigate('/music', { state: { subscriptionActivated: true } });
      } else if (state?.fromSettings) {
        navigate('/settings', { state: { subscriptionActivated: true } });
      } else {
        navigate('/music', { state: { subscriptionActivated: true } });
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      const errorMessage = error.message || 'Payment failed. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
      setIsPaymentProcessing(false);
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  // Handle free plan (skip payment)
  const handleFreePlan = async () => {
    if (!plan || !authUser) {
      setError('Plan or user information missing');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      await createSubscription();

      // Handle onboarding completion if from onboarding
      if (state?.fromOnboarding && state?.formData) {
        await handleOnboardingCompletion(state.formData);
        toast.success('Account created and subscription activated successfully!');
        navigate('/home');
        return;
      }

      toast.success('Subscription activated successfully!');

      // Navigate based on where user came from
      if (state?.fromMusic) {
        navigate('/music', { state: { subscriptionActivated: true } });
      } else if (state?.fromSettings) {
        navigate('/settings', { state: { subscriptionActivated: true } });
      } else {
        navigate('/music', { state: { subscriptionActivated: true } });
      }
    } catch (error: any) {
      console.error('Subscription creation error:', error);
      const errorMessage = error.message || 'Failed to create subscription. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!plan) {
    return (
      <div className="dashboard-theme bg-dashboard-bg min-h-screen">
        <EarthLoader context="subscription" />
      </div>
    );
  }

  const features = parseFeatures(plan.features);
  const planIsFree = isFreePlan(plan);

  return (
    <div className="dashboard-theme min-h-screen relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-dashboard-accent/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-dashboard-accent/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className={`relative z-10 bg-dashboard-bg w-full min-h-screen px-4 md:px-6 py-8 md:py-5 transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 sm:mb-12">
            <button
              onClick={() => {
                if (state?.fromOnboarding) {
                  // Navigate back to onboarding - the step 5 will be restored from state
                  navigate('/onboarding');
                } else if (state?.fromMusic) {
                  navigate('/music');
                } else if (state?.fromSettings) {
                  navigate('/settings');
                } else {
                  // Default fallback
                  navigate(-1);
                }
              }}
              className="group flex items-center gap-2 text-gray-400 hover:text-white transition-all duration-300 mb-6 hover:gap-3"
            >
              <div className="p-2 rounded-lg bg-dashboard-sidebar/50 group-hover:bg-dashboard-sidebar transition-colors border border-gray-700">
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">Back</span>
            </button>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-white via-dashboard-accent to-white bg-clip-text text-transparent">
                  Checkout
                </h1>
                <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-dashboard-accent animate-pulse" />
              </div>
              <p className="text-gray-400 text-base sm:text-lg">Secure your subscription in just a few clicks</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 sm:mb-8 animate-in slide-in-from-top duration-500">
              <div className="bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent border border-red-500/30 rounded-2xl p-5 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  </div>
                  <div className="flex-1">
                    <p className="text-red-300 font-semibold mb-1">Payment Error</p>
                    <p className="text-red-200/80 text-sm">{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-8">
            {/* Left Column - Takes 7 columns on large screens */}
            <div className="flex flex-col lg:col-span-7 space-y-6">
              {/* Price Breakdown - Order 1 on mobile */}
              <div className="order-1 bg-gradient-to-br from-dashboard-sidebar/80 to-dashboard-sidebar/60 backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-gray-700 shadow-xl">
                <h3 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-3">
                  <div className="p-2 bg-dashboard-accent/20 rounded-lg border border-dashboard-accent/30">
                    <Calendar className="w-5 h-5 text-dashboard-accent" />
                  </div>
                  Billing Summary
                </h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-3 px-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
                    <span className="text-gray-300 font-medium">Plan Price</span>
                    <span className="text-white font-bold text-lg">₹{formatCost(plan.cost)}</span>
                  </div>

                  <div className="flex justify-between items-center py-3 px-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
                    <span className="text-gray-300 font-medium">Billing Cycle</span>
                    <span className="text-white font-semibold capitalize">{plan.duration}</span>
                  </div>

                  <div className="flex justify-between items-center py-3 px-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
                    <span className="text-gray-300 font-medium">Tax</span>
                    <span className="text-green-400 font-semibold flex items-center gap-1">
                      <Check className="w-4 h-4" />
                      Included
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-gray-700 mt-4">
                    <span className="text-lg sm:text-xl font-bold text-white">Total Due Today</span>
                    <div className="relative">
                      <span className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                        ₹{formatCost(plan.cost)}
                      </span>
                      <span className="absolute inset-0 text-2xl sm:text-3xl font-bold bg-gradient-to-r from-dashboard-accent via-dashboard-accent/80 to-white bg-clip-text text-transparent blur-sm opacity-50 -z-10">
                        ₹{formatCost(plan.cost)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Card - Order 2 on mobile, but should be in right column on large screens */}
              <div className="order-2 lg:hidden">
                <div className="bg-gradient-to-br from-dashboard-sidebar via-dashboard-sidebar to-dashboard-sidebar/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-gray-700 hover:border-dashboard-accent/40 transition-all duration-500 hover:shadow-2xl hover:shadow-dashboard-accent/20 shadow-lg">
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-gradient-to-br from-dashboard-accent/20 to-dashboard-accent/10 rounded-xl border border-dashboard-accent/30">
                        <CreditCard className="w-6 h-6 text-dashboard-accent" />
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white">Payment</h2>
                    </div>

                    {planIsFree ? (
                      <p className="text-gray-400 leading-relaxed">
                        This is a free plan. No payment required to get started.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-gray-400 leading-relaxed">
                          Secure payment powered by Razorpay
                        </p>

                        {/* Payment Methods */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="px-3 py-2 bg-white/15 hover:bg-white/20 rounded-lg text-xs text-white font-bold border border-white/20 transition-colors cursor-default">VISA</div>
                          <div className="px-3 py-2 bg-white/15 hover:bg-white/20 rounded-lg text-xs text-white font-bold border border-white/20 transition-colors cursor-default">MC</div>
                          <div className="px-3 py-2 bg-white/15 hover:bg-white/20 rounded-lg text-xs text-white font-bold border border-white/20 transition-colors cursor-default">UPI</div>
                          <div className="px-3 py-2 bg-gray-700/50 hover:bg-gray-700/70 rounded-lg text-xs text-gray-300 font-semibold border border-gray-600/50 transition-colors cursor-default">+more</div>
                        </div>

                        {/* Payment Mode Toggle */}
                        <div className="pt-2 border-t border-gray-700">
                          <PaymentModeToggle
                            mode={paymentMode}
                            onChange={setPaymentMode}
                            disabled={isPaymentProcessing || isProcessing}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CTA Button */}
                  {planIsFree ? (
                    <button
                      onClick={handleFreePlan}
                      disabled={isProcessing}
                      className="w-full group relative overflow-hidden bg-gradient-to-r from-dashboard-accent to-dashboard-accent/80 hover:from-dashboard-accent/90 hover:to-dashboard-accent/70 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-dashboard-accent/30 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                      <span className="relative flex items-center justify-center gap-2">
                        {isProcessing ? (
                          <>
                            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Activating...
                          </>
                        ) : (
                          <>
                            Activate Free Plan
                            <Zap className="w-5 h-5" />
                          </>
                        )}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={handlePayment}
                      disabled={isProcessing || isPaymentProcessing}
                      className="w-full group relative overflow-hidden bg-dashboard-accent hover:bg-dashboard-accent/90 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-dashboard-accent/30 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                      <span className="relative flex items-center justify-center gap-2">
                        {isPaymentProcessing || isProcessing ? (
                          <>
                            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            {isPaymentProcessing ? 'Processing...' : 'Completing...'}
                          </>
                        ) : (
                          <>
                            <Lock className="w-5 h-5" />
                            Complete Secure Payment
                          </>
                        )}
                      </span>
                    </button>
                  )}

                  {!planIsFree && (
                    <p className="text-xs text-gray-500 mt-4 text-center leading-relaxed">
                      By proceeding, you agree to our Terms of Service and Privacy Policy
                    </p>
                  )}
                </div>
              </div>

              {/* Main Plan Card - Order 3 on mobile */}
              <div className="order-3 group relative bg-gradient-to-br from-dashboard-sidebar via-dashboard-sidebar to-dashboard-sidebar/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-gray-700 hover:border-dashboard-accent/40 transition-all duration-500 hover:shadow-2xl hover:shadow-dashboard-accent/20 shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-dashboard-accent/10 via-dashboard-accent/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-dashboard-accent/5 rounded-full blur-3xl"></div>

                <div className="relative">
                  {/* Plan Header */}
                  <div className="flex flex-col sm:flex-row items-start justify-between mb-8 gap-4">
                    <div className="flex-1">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-dashboard-accent/20 to-dashboard-accent/10 rounded-full border border-dashboard-accent/30 mb-4">
                        <Zap className="w-4 h-4 text-dashboard-accent" />
                        <span className="text-sm font-semibold text-dashboard-accent uppercase tracking-wider">
                          {plan.duration}
                        </span>
                      </div>

                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 flex items-center gap-3">
                        {plan.plan_name} Plan
                        <span className="text-xl sm:text-2xl">✨</span>
                      </h3>

                      <div className="flex flex-wrap gap-3 sm:gap-4 text-sm">
                        {plan.songs_quota && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <div className="p-1.5 bg-gray-700/50 rounded-lg">
                              <Zap className="w-3.5 h-3.5 text-dashboard-accent" />
                            </div>
                            <span className="font-medium">{plan.songs_quota} Songs</span>
                          </div>
                        )}
                        {plan.ai_guide_quota && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <div className="p-1.5 bg-gray-700/50 rounded-lg">
                              <Zap className="w-3.5 h-3.5 text-dashboard-accent" />
                            </div>
                            <span className="font-medium">{plan.ai_guide_quota} AI Guides</span>
                          </div>
                        )}
                        {plan.max_devices && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <div className="p-1.5 bg-gray-700/50 rounded-lg">
                              <Users className="w-3.5 h-3.5 text-dashboard-accent" />
                            </div>
                            <span className="font-medium">Up to {plan.max_devices} Devices</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-sm text-gray-400 mb-2 font-medium">Total</div>
                      <div className="relative">
                        <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white drop-shadow-lg">
                          ₹{formatCost(plan.cost)}
                        </div>
                        <div className="absolute inset-0 text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-dashboard-accent via-dashboard-accent/80 to-white bg-clip-text text-transparent blur-sm opacity-50 -z-10">
                          ₹{formatCost(plan.cost)}
                        </div>
                      </div>
                      {!planIsFree && (
                        <div className="text-gray-400 text-sm mt-2 font-medium">
                          /{plan.duration === 'monthly' ? 'month' : 'year'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Features Grid */}
                  {features.length > 0 && (
                    <div className="border-t border-gray-700/50 pt-8">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                        <div className="h-px flex-1 bg-gradient-to-r from-gray-700 to-transparent"></div>
                        <span>What's Included</span>
                        <div className="h-px flex-1 bg-gradient-to-l from-gray-700 to-transparent"></div>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {features.map((feature, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-3 group/item hover:translate-x-1 transition-transform duration-300"
                            style={{
                              animation: `slideIn 0.5s ease-out ${idx * 0.1}s both`
                            }}
                          >
                            <div className="p-1.5 bg-gradient-to-br from-dashboard-accent/20 to-dashboard-accent/10 rounded-lg border border-dashboard-accent/30 group-hover/item:border-dashboard-accent/50 transition-colors mt-0.5">
                              <Check className="w-3.5 h-3.5 text-dashboard-accent" />
                            </div>
                            <span className="text-gray-300 text-sm leading-relaxed">
                              {typeof feature === 'object' ? feature.feature : feature}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Payment Section - Takes 5 columns on large screens, hidden on mobile */}
            <div className="hidden lg:block lg:col-span-5">
              <div className="lg:sticky lg:top-8 space-y-6">
                {/* Payment Card */}
                <div className="bg-gradient-to-br from-dashboard-sidebar via-dashboard-sidebar to-dashboard-sidebar/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-gray-700 hover:border-dashboard-accent/40 transition-all duration-500 hover:shadow-2xl hover:shadow-dashboard-accent/20 shadow-lg">
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-gradient-to-br from-dashboard-accent/20 to-dashboard-accent/10 rounded-xl border border-dashboard-accent/30">
                        <CreditCard className="w-6 h-6 text-dashboard-accent" />
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white">Payment</h2>
                    </div>

                    {planIsFree ? (
                      <p className="text-gray-400 leading-relaxed">
                        This is a free plan. No payment required to get started.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-gray-400 leading-relaxed">
                          Secure payment powered by Razorpay
                        </p>

                        {/* Payment Methods */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="px-3 py-2 bg-white/15 hover:bg-white/20 rounded-lg text-xs text-white font-bold border border-white/20 transition-colors cursor-default">VISA</div>
                          <div className="px-3 py-2 bg-white/15 hover:bg-white/20 rounded-lg text-xs text-white font-bold border border-white/20 transition-colors cursor-default">MC</div>
                          <div className="px-3 py-2 bg-white/15 hover:bg-white/20 rounded-lg text-xs text-white font-bold border border-white/20 transition-colors cursor-default">UPI</div>
                          <div className="px-3 py-2 bg-gray-700/50 hover:bg-gray-700/70 rounded-lg text-xs text-gray-300 font-semibold border border-gray-600/50 transition-colors cursor-default">+more</div>
                        </div>

                        {/* Payment Mode Toggle */}
                        <div className="pt-2 border-t border-gray-700">
                          <PaymentModeToggle
                            mode={paymentMode}
                            onChange={setPaymentMode}
                            disabled={isPaymentProcessing || isProcessing}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CTA Button */}
                  {planIsFree ? (
                    <button
                      onClick={handleFreePlan}
                      disabled={isProcessing}
                      className="w-full group relative overflow-hidden bg-gradient-to-r from-dashboard-accent to-dashboard-accent/80 hover:from-dashboard-accent/90 hover:to-dashboard-accent/70 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-dashboard-accent/30 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                      <span className="relative flex items-center justify-center gap-2">
                        {isProcessing ? (
                          <>
                            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Activating...
                          </>
                        ) : (
                          <>
                            Activate Free Plan
                            <Zap className="w-5 h-5" />
                          </>
                        )}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={handlePayment}
                      disabled={isProcessing || isPaymentProcessing}
                      className="w-full group relative overflow-hidden bg-dashboard-accent hover:bg-dashboard-accent/90 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-dashboard-accent/30 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                      <span className="relative flex items-center justify-center gap-2">
                        {isPaymentProcessing || isProcessing ? (
                          <>
                            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            {isPaymentProcessing ? 'Processing...' : 'Completing...'}
                          </>
                        ) : (
                          <>
                            <Lock className="w-5 h-5" />
                            Complete Secure Payment
                          </>
                        )}
                      </span>
                    </button>
                  )}

                  {!planIsFree && (
                    <p className="text-xs text-gray-500 mt-4 text-center leading-relaxed">
                      By proceeding, you agree to our Terms of Service and Privacy Policy
                    </p>
                  )}
                </div>

                {/* Trust Signals */}
                <div className="bg-gradient-to-br from-dashboard-sidebar/60 to-dashboard-sidebar/40 backdrop-blur-xl rounded-2xl p-6 border border-gray-700 shadow-lg">
                  <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-5 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-green-400" />
                    Security & Trust
                  </h3>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm py-2 px-3 bg-gray-800/30 rounded-lg border border-gray-700/50 hover:border-green-400/30 transition-colors">
                      <div className="p-2 bg-green-500/20 rounded-lg border border-green-500/30">
                        <Shield className="w-4 h-4 text-green-400" />
                      </div>
                      <span className="text-gray-200 font-medium">256-bit SSL encryption</span>
                    </div>

                    <div className="flex items-center gap-3 text-sm py-2 px-3 bg-gray-800/30 rounded-lg border border-gray-700/50 hover:border-dashboard-accent/30 transition-colors">
                      <div className="p-2 bg-dashboard-accent/20 rounded-lg border border-dashboard-accent/30">
                        <Lock className="w-4 h-4 text-dashboard-accent" />
                      </div>
                      <span className="text-gray-200 font-medium">PCI DSS compliant</span>
                    </div>

                    <div className="flex items-center gap-3 text-sm py-2 px-3 bg-gray-800/30 rounded-lg border border-gray-700/50 hover:border-dashboard-accent/30 transition-colors">
                      <div className="p-2 bg-dashboard-accent/20 rounded-lg border border-dashboard-accent/30">
                        <Check className="w-4 h-4 text-dashboard-accent" />
                      </div>
                      <span className="text-gray-200 font-medium">Money-back guarantee</span>
                    </div>
                  </div>
                </div>

                {/* Support */}
                <div className="bg-gradient-to-br from-dashboard-accent/15 via-dashboard-accent/10 to-dashboard-accent/5 backdrop-blur-xl rounded-2xl p-6 border border-dashboard-accent/30 shadow-lg">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-dashboard-accent/20 rounded-lg border border-dashboard-accent/30 flex-shrink-0">
                      <Shield className="w-4 h-4 text-dashboard-accent" />
                    </div>
                    <p className="text-sm text-gray-200 text-left leading-relaxed">
                      <span className="font-semibold text-white">Need help?</span> Our support team is available 24/7 to assist you with your subscription.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

const Checkout = () => {
  if (!MUSIC_SUBSCRIPTION_FLOWS_ENABLED) return <MusicSubscriptionUnavailable />;
  return <ActiveCheckout />;
};

export default Checkout;

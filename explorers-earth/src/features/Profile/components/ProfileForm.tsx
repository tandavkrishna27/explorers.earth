import ThemeAppearanceSection from "./ThemeAppearanceSection";
import { Formik, Form, Field, ErrorMessage, useFormikContext } from "formik";
import { FC, memo, ReactNode, useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import * as Yup from "yup";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { countries } from "../../../components/ui/CountryCodeDropdown";
import { createProfileValidationSchema } from "../data";
import {
  SOCIAL_VISIBILITY_FORM_FIELDS,
  type SocialVisibilityKey,
} from "../config/socialVisibility";
import Button from "../../../components/ui/Button";
import AddressInput from "./AddressInput";
import BusinessLocationFields from "./BusinessLocationFields";
import FeedFields from "./FeedFields.tsx";
import { Places } from "../types/types";
import {
  awaitProfileSaveTerminal,
  type KeyValuePair,
  type ProfileSubmit,
  type SaveTerminalStatus,
} from "../types/profileSave";
import TiptapEditor from "../../Favorites/components/TiptapEditor";
// import SwitchButton from "../../../components/ui/SwitchButton";
import { AddIcon } from "../../../assets/icons/AddIcon";
import CrossIcon from "../../../assets/icons/CrossIcon";
import EyeOnIcon from "../../../assets/icons/EyeOnIcon";
import EyeOffIcon from "../../../assets/icons/EyeOffIcon";
import CurrLocation from "../../../assets/icons/CurrLocation";
import Accordion from "../../../components/ui/Accordian";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import UsernameInput from "../../../components/ui/UsernameInput";
import PhoneInputWithCountry from "../../../components/ui/PhoneInputWithCountry";
// Social Media Icons
import InstagramIcon from "../../../assets/icons/InstagramIcon";
import WhatsappIcon from "../../../assets/icons/WhatsappIcon";
import YoutubeIcon from "../../../assets/icons/YoutubeIcon";
import TwitterIcon from "../../../assets/icons/TwitterIcon";
import Spotify from "../../../assets/icons/Spotify";
import LinkIcon from "../../../assets/icons/LinkIcon";
import FacebookIcon from "../../../assets/icons/FacebookIcon";
import YoutubeMusic from "../../../assets/icons/YoutubeMusic";
import Gmail from "../../../assets/icons/Gmail";
import LinkedinIcon from "../../../assets/icons/LinkedinIcon";
import AppleMusic from "../../../assets/icons/AppleMusic";
import TiktokIcon from "../../../assets/icons/TiktokIcon";
import SnapchatIcon from "../../../assets/icons/SnapchatIcon";
import MobileIcon from "../../../assets/icons/MobileIcon";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import type {
  FeedAsyncState,
  ProfileWorkspace,
  ProfileWorkspaceId,
} from "../types/profileWorkspaces";

// Helper function to normalize mobile number format
// Converts wrong format (ISO code + number, like "AF9140284510") to correct format (+numeric code, like "+939140284510")
// @ts-expect-error - Legacy helper function kept for potential future use
const normalizeMobileNumber = (value: string | undefined): string => {
  if (!value || value.trim() === '') return "";

  // Check if value is in wrong format (ISO code + number, like "AF9140284510")
  const isoCodeMatch = value.match(/^([A-Z]{2})(\d+)$/);
  if (isoCodeMatch) {
    // Convert wrong format to correct format
    const [, isoCode, number] = isoCodeMatch;
    const country = countries.find(c => c.code === isoCode);
    if (country) {
      return `${country.callingCode}${number}`;
    }
  }

  // If already in correct format or needs parsing, try to parse and reformat
  try {
    const parsed = parsePhoneNumberFromString(value);
    if (parsed && parsed.isValid()) {
      // Format as E.164 (international format with +)
      return parsed.format('E.164') || value;
    }
  } catch (error) {
    // If parsing fails, return original value
    console.warn('Could not parse mobile number:', value);
  }

  return value;
};

// Phone number validation schema
// @ts-expect-error - Legacy validation schema kept for potential future use
const phoneValidationSchema = Yup.object({
  mobilenumberLink: Yup.string()
    .test(
      'is-valid-phone',
      'Please enter a valid mobile number',
      function (value) {
        if (!value || value.trim() === '') return true; // Allow empty values

        try {
          // Parse the phone number - this handles international formats
          const phoneNumber = parsePhoneNumberFromString(value);

          // Check if it's a valid phone number
          return phoneNumber && phoneNumber.isValid();
        } catch (error) {
          // If parsing fails, it's not a valid phone number
          return false;
        }
      }
    ),
});

export type { KeyValuePair } from "../types/profileSave";

// types for form field
export interface FormField {
  name: string;
  label: string;
  type: string;
  isRequired?: boolean;
  placeholder?: string;
  options?: string[];
  optionLabels?: string[];
  as?: string;
  span?: "auto" | "full";
  components?: {
    icon?: ReactNode;
    value?: string;
    name?: string;
    label?: string;
    type?: string;
  }[];
}

export interface FormSection {
  id?: string;
  heading: string;
  description?: string;
  presentation?: "accordion" | "direct";
  icon?: LucideIcon;
  defaultOpen?: boolean;
  layout?: {
    columns: 1 | 2;
    minWidth?: number;
  };
  structuralLabel?: "section" | "field";
  formFields: FormField[];
}

// types for profile form component
interface ProfileFormBaseProps {
  initialValues: KeyValuePair;
  onSubmit: ProfileSubmit;
  setPlaces: (places: Places, setFieldValue?: (field: string, value: any) => void) => void;
  DetectLocation: (setFieldValue?: (field: string, value: any) => void) => void;
  usernameDisabled?: boolean; // legacy support; we will not disable, but keep prop for compatibility
  usernameCooldownMessage?: string;
  onFormDirtyChange?: (isDirty: boolean) => void; // Callback to notify parent about dirty state
  onResetDirtyState?: (resetFn: () => void) => void; // Callback to expose reset function to parent
  onFeedDataChange?: () => void; // Callback to notify when Feed_Data changes
  onFeedAsyncStateChange?: (state: FeedAsyncState) => void;
  onRegisterSubmit?: (
    submit: (() => Promise<SaveTerminalStatus>) | null,
  ) => void;
  surface?: "contained" | "flat";
  actionsPlacement?: "fixed" | "inline";
}

interface SingleProfileFormProps extends ProfileFormBaseProps {
  mode?: "single";
  formFields: FormSection[];
  workspaces?: never;
  activeWorkspace?: never;
  scopeKey?: never;
}

interface WorkspaceProfileFormProps extends ProfileFormBaseProps {
  mode: "workspaces";
  workspaces: ProfileWorkspace<FormSection>[];
  activeWorkspace: ProfileWorkspaceId;
  scopeKey: string;
  // Compatibility snapshot for page-level harnesses; workspace rendering uses
  // `workspaces` so switching never creates a second Formik boundary.
  formFields: FormSection[];
}

export type ProfileFormProps =
  | SingleProfileFormProps
  | WorkspaceProfileFormProps;

const createInitialVisibility = (
  initialValues: KeyValuePair,
): Record<string, boolean> =>
  Object.fromEntries(
    Object.entries(SOCIAL_VISIBILITY_FORM_FIELDS).map(([key, fieldName]) => [
      key,
      Boolean(initialValues[fieldName]),
    ]),
  );

// Runs the form's side effects from inside the Formik provider. Extracted from
// the render-prop callback because React hooks may not be called in callbacks.
const ProfileFormEffects: FC<{
  setFieldValueRef: React.MutableRefObject<((field: string, value: any) => void) | null>;
  address: string;
  setAddress: (address: string) => void;
  isFormInitialized: boolean;
  initialValues: KeyValuePair;
}> = ({ setFieldValueRef, address, setAddress, isFormInitialized, initialValues }) => {
  const { values, setFieldValue } = useFormikContext<KeyValuePair>();

  // Store setFieldValue in ref for use in DetectLocation
  useEffect(() => {
    setFieldValueRef.current = setFieldValue;
  }, [setFieldValue]);

  // Sync address state with Formik values (for location detection)
  useEffect(() => {
    if (values.address !== undefined && values.address !== address) {
      setAddress(values.address);
    }
  }, [values.address]);

  // Update form values when switching tabs, but only for empty fields
  // This runs during initialization and should not trigger dirty state
  useEffect(() => {
    // Only update values if form is not yet initialized to prevent triggering dirty state
    if (!isFormInitialized) {
      Object.keys(initialValues).forEach(key => {
        // Only update if the current value is empty or undefined
        if (!values[key] && initialValues[key]) {
          setFieldValue(key, initialValues[key], false); // false = don't validate, don't trigger dirty
        }
      });
    }
  }, [initialValues, setFieldValue, isFormInitialized]);

  return null;
};

const ProfileFormSectionShell: FC<{
  section: FormSection;
  sectionIndex: number;
  surface: "contained" | "flat";
  children: ReactNode;
}> = ({ section, sectionIndex, surface, children }) => {
  const SectionIcon = section.icon;
  const sectionId = section.id || `profile-form-section-${sectionIndex}`;
  const isDirect = section.presentation === "direct";
  const dataWalkthrough =
    section.formFields.some(
      (field) => field.name === "accountName" || field.name === "bio",
    )
      ? "profile-information-accordion"
      : section.formFields.some((field) => field.name === "socialLinks")
        ? "social-media-accordion"
        : undefined;

  if (isDirect) {
    const headingId = `${sectionId}-heading`;
    return (
      <section
        aria-labelledby={headingId}
        className={sectionIndex > 0 ? "mt-8" : ""}
      >
        <header className="mb-5">
          <div className="flex items-center gap-3">
            {SectionIcon && (
              <SectionIcon
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-dashboard-accent"
              />
            )}
            <h2
              id={headingId}
              className="text-lg font-semibold text-dashboard"
            >
              {section.heading}
            </h2>
          </div>
          {section.description && (
            <p className="mt-2 text-sm leading-6 text-dashboard-light">
              {section.description}
            </p>
          )}
        </header>
        {children}
      </section>
    );
  }

  return (
    <div className={sectionIndex > 0 ? "mt-3 md:mt-4" : ""}>
      <Accordion
        id={sectionId}
        heading={section.heading}
        headingIcon={
          SectionIcon ? (
            <SectionIcon aria-hidden="true" className="h-5 w-5" />
          ) : undefined
        }
        defaultOpen={section.defaultOpen ?? false}
        variant={surface === "flat" ? "flat" : "card"}
        data-walkthrough={dataWalkthrough}
      >
        {section.description && (
          <p className="mb-4 mt-2 text-sm text-dashboard-light">
            {section.description}
          </p>
        )}
        {children}
      </Accordion>
    </div>
  );
};

const ProfileFormActions: FC<{
  onRegisterSubmit?: ProfileFormProps["onRegisterSubmit"];
  submit: (
    values: KeyValuePair,
    resetForm: (nextState?: { values: KeyValuePair }) => void,
  ) => Promise<SaveTerminalStatus>;
  isSaving: boolean;
  placement: "fixed" | "inline";
}> = ({ onRegisterSubmit, submit, isSaving, placement }) => {
  const { t } = useTranslation();
  const { values, resetForm } = useFormikContext<KeyValuePair>();
  const valuesRef = useRef(values);
  const resetFormRef = useRef(resetForm);
  const submitRef = useRef(submit);
  const inFlightRef = useRef<Promise<SaveTerminalStatus> | null>(null);

  valuesRef.current = values;
  resetFormRef.current = resetForm;
  submitRef.current = submit;

  const submitCurrentSnapshot = useCallback(() => {
    if (inFlightRef.current) return inFlightRef.current;

    const submission = submitRef.current(
      valuesRef.current,
      resetFormRef.current,
    );
    inFlightRef.current = submission;
    void submission.then(
      () => {
        if (inFlightRef.current === submission) inFlightRef.current = null;
      },
      () => {
        if (inFlightRef.current === submission) inFlightRef.current = null;
      },
    );
    return submission;
  }, []);

  useEffect(() => {
    if (!onRegisterSubmit) return;
    onRegisterSubmit(submitCurrentSnapshot);
    return () => onRegisterSubmit(null);
  }, [onRegisterSubmit, submitCurrentSnapshot]);

  return (
    <div
      className={
        placement === "fixed"
          ? "profile-editor-save-dock fixed left-0 right-0 z-[100] flex justify-center bg-dashboard-bg px-4 py-2"
          : "profile-editor-save-dock mt-4 flex justify-end bg-transparent py-2"
      }
    >
      <div data-walkthrough="save-publish-button">
        <Button
          btnText={t("dashboard.profile.common.saveAndPublish")}
          type="button"
          variant="primary"
          size="small"
          isLoading={isSaving}
          onClick={submitCurrentSnapshot}
          disabled={isSaving}
          className="min-h-11 rounded-md bg-primary px-8 py-3 font-semibold text-white shadow-dashboard-elevated transition-colors hover:bg-primary-dark md:px-12"
        />
      </div>
    </div>
  );
};

const ProfileFormSession: FC<ProfileFormProps> = memo(
  ({
    initialValues,
    onSubmit,
    formFields,
    setPlaces,
    DetectLocation,
    usernameDisabled,
    usernameCooldownMessage,
    onFormDirtyChange,
    onResetDirtyState,
    onFeedDataChange,
    onFeedAsyncStateChange,
    onRegisterSubmit,
    mode = "single",
    workspaces,
    activeWorkspace,
    scopeKey,
    surface = "contained",
    actionsPlacement = "fixed",
  }) => {
    const { t } = useTranslation();
    const isWorkspaceMode = mode === "workspaces";
    const [visitedWorkspaces, setVisitedWorkspaces] = useState(
      () =>
        new Set<ProfileWorkspaceId>(
          isWorkspaceMode && activeWorkspace ? [activeWorkspace] : [],
        ),
    );
    const validationSchema = createProfileValidationSchema(t);
    const [address, setAddress] = useState<string>("");
    const [sameAsAddress, setSameAsAddress] = useState(false);
    const [bio, setBio] = useState<string>("");
    const [primaryAddressCombined, setPrimaryAddressCombined] =
      useState<string>(initialValues.primaryAddressCombined || "");

    // ✅ SIMPLE: useState-based dirty state tracking - only when user actually changes something
    const [isFormDirty, setIsFormDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingFeedOperations, setPendingFeedOperations] = useState(
      () => new Map<string, FeedAsyncState["operation"]>(),
    );
    // Track if form has been initialized to prevent false positives during initialization
    const [isFormInitialized, setIsFormInitialized] = useState(false);

    // Mark form as initialized after a short delay to allow Formik to set initial values
    useEffect(() => {
      const timer = setTimeout(() => {
        setIsFormInitialized(true);
      }, 100);
      return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
      if (!isWorkspaceMode || !activeWorkspace) return;
      setVisitedWorkspaces((current) => {
        if (current.has(activeWorkspace)) return current;
        const next = new Set(current);
        next.add(activeWorkspace);
        return next;
      });
    }, [activeWorkspace, isWorkspaceMode]);

    const handleFeedAsyncStateChange = useCallback(
      (state: FeedAsyncState) => {
        const { pending, operation, requestId } = state;
        setPendingFeedOperations((current) => {
          const next = new Map(current);
          if (pending) next.set(requestId, operation);
          else next.delete(requestId);
          return next;
        });
        onFeedAsyncStateChange?.(state);
      },
      [onFeedAsyncStateChange],
    );

    const renderGroups: ProfileWorkspace<FormSection>[] = isWorkspaceMode
      ? workspaces || []
      : [
          {
            id: "profile",
            headingId: "",
            sections: formFields,
            width: "readable",
          },
        ];

    // Notify parent component about dirty state changes
    useEffect(() => {
      if (onFormDirtyChange) {
        onFormDirtyChange(isFormDirty);
      }
    }, [isFormDirty, onFormDirtyChange]);

    // Function to reset dirty state (can be called from parent)
    const resetDirtyState = useCallback(() => {
      // Reset dirty state
      setIsFormDirty(false);
    }, []);

    // Expose reset function to parent component
    useEffect(() => {
      if (onResetDirtyState) {
        onResetDirtyState(resetDirtyState);
      }
    }, [onResetDirtyState, resetDirtyState]);


    // Initialize bio state
    useEffect(() => {
      setBio(initialValues.bio || "");
    }, [initialValues.bio]);

    // Initialize primary address combined state
    useEffect(() => {
      setPrimaryAddressCombined(initialValues.primaryAddressCombined || "");
    }, [initialValues.primaryAddressCombined]);

    // Handle form field updates when switching tabs - only update empty fields
    useEffect(() => {
      // This effect will be handled by the Formik component's setFieldValue
      // We'll update this in the Formik render function
    }, [initialValues]);

    // Visibility state management
    const [visibility, setVisibility] = useState<{ [key: string]: boolean }>(
      () => createInitialVisibility(initialValues),
    );

    // Mobile number visibility state
    const [isPublic, setIsPublic] = useState<boolean>(
      initialValues.mobilenumberVisiblity ?? true
    );

    // Initialize mobile visibility from initial values
    useEffect(() => {
      if (initialValues.mobilenumberVisiblity !== undefined) {
        setIsPublic(initialValues.mobilenumberVisiblity);
      }
    }, [initialValues.mobilenumberVisiblity]);

    // Tag management
    const [activeFields, setActiveFields] = useState<string[]>([]);
    const taggableFields = [

      t('dashboard.profile.publicProfile.fields.instagram'),
      t('dashboard.profile.publicProfile.fields.whatsapp'),
      t('dashboard.profile.publicProfile.fields.youtube'),
      t('dashboard.profile.publicProfile.fields.x'),
      t('dashboard.profile.publicProfile.fields.spotify'),
      t('dashboard.profile.publicProfile.fields.website'),
      t('dashboard.profile.publicProfile.fields.facebook'),
      t('dashboard.profile.publicProfile.fields.youtubeMusic'),
      t('dashboard.profile.publicProfile.fields.gmail'),
      t('dashboard.profile.publicProfile.fields.linkedin'),
      t('dashboard.profile.publicProfile.fields.appleMusic'),
      t('dashboard.profile.publicProfile.fields.tiktok'),
      t('dashboard.profile.publicProfile.fields.snapchat'),
    ];
    const socialLinkFieldByLabel = new Map<string, string>([
      [t('dashboard.profile.publicProfile.fields.instagram'), "instagramLink"],
      [t('dashboard.profile.publicProfile.fields.whatsapp'), "whatsappLink"],
      [t('dashboard.profile.publicProfile.fields.youtube'), "youtubeLink"],
      [t('dashboard.profile.publicProfile.fields.x'), "XLink"],
      [t('dashboard.profile.publicProfile.fields.spotify'), "spotifyLink"],
      [t('dashboard.profile.publicProfile.fields.website'), "websiteLink"],
      [t('dashboard.profile.publicProfile.fields.facebook'), "facebookLink"],
      [t('dashboard.profile.publicProfile.fields.youtubeMusic'), "youtubeMusicLink"],
      [t('dashboard.profile.publicProfile.fields.gmail'), "gmailLink"],
      [t('dashboard.profile.publicProfile.fields.linkedin'), "linkedinLink"],
      [t('dashboard.profile.publicProfile.fields.appleMusic'), "appleMusicLink"],
      [t('dashboard.profile.publicProfile.fields.tiktok'), "tiktokLink"],
      [t('dashboard.profile.publicProfile.fields.snapchat'), "snapchatLink"],
    ]);
    const socialVisibilityKeyByLabel = new Map<string, string>([
      [t('dashboard.profile.publicProfile.fields.instagram'), "Instagram"],
      [t('dashboard.profile.publicProfile.fields.whatsapp'), "Whatsapp"],
      [t('dashboard.profile.publicProfile.fields.youtube'), "Youtube"],
      [t('dashboard.profile.publicProfile.fields.x'), "X"],
      [t('dashboard.profile.publicProfile.fields.spotify'), "Spotify"],
      [t('dashboard.profile.publicProfile.fields.website'), "Website"],
      [t('dashboard.profile.publicProfile.fields.facebook'), "Facebook"],
      [t('dashboard.profile.publicProfile.fields.youtubeMusic'), "YoutubeMusic"],
      [t('dashboard.profile.publicProfile.fields.gmail'), "Gmail"],
      [t('dashboard.profile.publicProfile.fields.linkedin'), "Linkedin"],
      [t('dashboard.profile.publicProfile.fields.appleMusic'), "AppleMusic"],
      [t('dashboard.profile.publicProfile.fields.tiktok'), "Tiktok"],
      [t('dashboard.profile.publicProfile.fields.snapchat'), "Snapchat"],
    ]);

    // Initialize active fields from initial values - only on mount
    useEffect(() => {
      const initialActiveFields: string[] = [];
      taggableFields.forEach((field) => {
        // Map platform names to their corresponding field names
        let fieldName = "";
        switch (field) {
          case t('dashboard.profile.publicProfile.fields.instagram'):
            fieldName = "instagramLink";
            break;
          case t('dashboard.profile.publicProfile.fields.whatsapp'):
            fieldName = "whatsappLink";
            break;
          case t('dashboard.home.mobile'):
            fieldName = "mobilenumberLink";
            break;
          case t('dashboard.profile.publicProfile.fields.youtube'):
            fieldName = "youtubeLink";
            break;
          case t('dashboard.profile.publicProfile.fields.x'):
            fieldName = "XLink";
            break;
          case t('dashboard.profile.publicProfile.fields.spotify'):
            fieldName = "spotifyLink";
            break;
          case t('dashboard.profile.publicProfile.fields.website'):
            fieldName = "websiteLink";
            break;
          case t('dashboard.profile.publicProfile.fields.facebook'):
            fieldName = "facebookLink";
            break;
          case t('dashboard.profile.publicProfile.fields.youtubeMusic'):
            fieldName = "youtubeMusicLink";
            break;
          case t('dashboard.profile.publicProfile.fields.gmail'):
            fieldName = "gmailLink";
            break;
          case t('dashboard.profile.publicProfile.fields.linkedin'):
            fieldName = "linkedinLink";
            break;
          case t('dashboard.profile.publicProfile.fields.appleMusic'):
            fieldName = "appleMusicLink";
            break;
          case t('dashboard.profile.publicProfile.fields.tiktok'):
            fieldName = "tiktokLink";
            break;
          case t('dashboard.profile.publicProfile.fields.snapchat'):
            fieldName = "snapchatLink";
            break;
          default:
            fieldName = field.toLowerCase().replace(/\s+/g, "") + "Link";
        }

        if (
          initialValues[fieldName] &&
          initialValues[fieldName].trim() !== ""
        ) {
          initialActiveFields.push(field);
        }
      });
      setActiveFields(initialActiveFields);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount

    // Device detection
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
      const checkDevice = () => {
        setIsDesktop(window.innerWidth >= 1024);
      };
      checkDevice();
      window.addEventListener("resize", checkDevice);
      return () => window.removeEventListener("resize", checkDevice);
    }, []);

    // Address handling
    const handleAddressChange = (value: string) => {
      setAddress(value);
      // Mark form as dirty when user changes address (only after initialization)
      if (isFormInitialized) {
        setIsFormDirty(true);
      }
    };

    const handlePrimaryAddressCombinedChange = (value: string) => {
      setPrimaryAddressCombined(value);
      // Mark form as dirty when user changes primary address (only after initialization)
      if (isFormInitialized) {
        setIsFormDirty(true);
      }
    };

    const handleSameAsAddressChange = (checked: boolean, values: any) => {
      setSameAsAddress(checked);
      if (checked) {
        const city = values.city || "";
        const country = values.country || "";
        const combined = city && country ? `${city}, ${country}` : city || country;
        setPrimaryAddressCombined(combined);
      }
      // Mark form as dirty when user changes same as address (only after initialization)
      if (isFormInitialized) {
        setIsFormDirty(true);
      }
    };

    // Bio handling
    const handleBioChange = (value: string) => {
      setBio(value);
      // Mark form as dirty when user changes bio (only after initialization)
      if (isFormInitialized) {
        setIsFormDirty(true);
      }
    };

    // Store setFieldValue in ref to pass to DetectLocation
    const setFieldValueRef = useRef<((field: string, value: any) => void) | null>(null);

    // Location detection
    const handleDetectLocation = () => {
      DetectLocation(setFieldValueRef.current || undefined);
    };

    // Tag management functions - using ref to prevent double-firing from StrictMode
    const lastClickedRef = useRef<{ field: string; timestamp: number } | null>(null);

    const handleTagClick = (fieldName: string) => {
      const now = Date.now();

      // Prevent double-firing: if same field clicked within 200ms, ignore
      if (
        lastClickedRef.current &&
        lastClickedRef.current.field === fieldName &&
        now - lastClickedRef.current.timestamp < 200
      ) {
        return;
      }

      lastClickedRef.current = { field: fieldName, timestamp: now };

      setActiveFields((prevActiveFields) => {
        if (prevActiveFields.includes(fieldName)) {
          // Remove if already active
          return prevActiveFields.filter((field) => field !== fieldName);
        } else {
          // Add if not active
          return [...prevActiveFields, fieldName];
        }
      });
      // Mark form as dirty when user adds/removes tags
      setIsFormDirty(true);
    };

    const handleRemoveTag = (fieldName: string) => {
      setActiveFields((prevActiveFields) =>
        prevActiveFields.filter((field) => field !== fieldName)
      );
      // Mark form as dirty when user removes tags
      setIsFormDirty(true);
    };

    // Visibility toggle
    const getVisibilityKey = (fieldName: string): SocialVisibilityKey | string =>
      socialVisibilityKeyByLabel.get(fieldName) || fieldName;

    const handleToggleVisibility = (fieldName: string) => {
      const visibilityKey = getVisibilityKey(fieldName);
      setVisibility((prev) => ({
        ...prev,
        [visibilityKey]: !prev[visibilityKey],
      }));
      setIsFormDirty(true);
    };

    // Form submission handler
    const formHandleSubmit = async (
      values: KeyValuePair,
      resetForm?: (nextState?: { values: KeyValuePair }) => void,
    ): Promise<SaveTerminalStatus> => {
      const pendingOperation = pendingFeedOperations.values().next().value;
      if (pendingOperation) {
        toast.error(
          t("dashboard.profile.editor.finishOperationFirst", {
            operation: pendingOperation.replace(/-/g, " "),
            defaultValue: `Finish the ${pendingOperation.replace(/-/g, " ")} before saving.`,
          }),
        );
        return "failed";
      }

      setIsSaving(true);
      try {
        // Combine all form data
        const formData = {
          ...values,
          mobilenumberLink: values.mobilenumberLink, // Already in E.164 format
          bio: bio,
          primaryAddressCombined: primaryAddressCombined,
          address: address,
          mobilenumberVisiblity: isPublic, // Use mobile visibility state
          visibility: visibility, // Add visibility state to form data
        };

        // Add social media fields
        taggableFields.forEach((field) => {
          const fieldName = socialLinkFieldByLabel.get(field);
          if (!fieldName) return;

          if (activeFields.includes(field)) {
            (formData as any)[fieldName] = values[fieldName] || "";
          } else {
            (formData as any)[fieldName] = "";
          }
        });

        const result = await onSubmit(formData);
        const terminal = await awaitProfileSaveTerminal(result);

        if (terminal === "saved") {
          resetDirtyState();
          resetForm?.({ values });
        }

        return terminal;
      } catch {
        return "failed";
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <Formik
        initialValues={initialValues}
        onSubmit={(values) => {
          void formHandleSubmit(values);
        }}
        validationSchema={validationSchema}
        enableReinitialize={false}
      >
        {({ values, setFieldValue, handleChange, touched, errors }) => {
          return (
            <Form
              className="w-full scroll-pt-24 scroll-pb-36 pb-[calc(7rem+env(safe-area-inset-bottom))] font-poppins md:pb-0"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }}
              onMouseDown={(e) => {
                // Prevent any mouse events from bubbling up to header
                e.stopPropagation();
              }}
            >
              <ProfileFormEffects
                setFieldValueRef={setFieldValueRef}
                address={address}
                setAddress={setAddress}
                isFormInitialized={isFormInitialized}
                initialValues={initialValues}
              />
              <div
                className={
                  surface === "flat"
                    ? "mx-auto w-full"
                    : "mx-auto w-full max-w-sm rounded-2xl border border-white bg-dashboard-muted p-2 shadow-dashboard-elevated backdrop-blur-sm sm:max-w-md md:max-w-2xl md:p-6 lg:max-w-3xl"
                }
              >
                {renderGroups.map((workspace) => {
                  const isActive =
                    !isWorkspaceMode || workspace.id === activeWorkspace;
                  const shouldMount =
                    !isWorkspaceMode ||
                    isActive ||
                    visitedWorkspaces.has(workspace.id);

                  return (
                    <section
                      key={workspace.id}
                      id={
                        isWorkspaceMode
                          ? `profile-editor-panel-${workspace.id}`
                          : undefined
                      }
                      role={isWorkspaceMode ? "tabpanel" : undefined}
                      aria-labelledby={
                        isWorkspaceMode
                          ? `profile-editor-tab-${workspace.id}${
                              isActive ? ` ${workspace.headingId}` : ""
                            }`
                          : undefined
                      }
                      hidden={isWorkspaceMode ? !isActive : undefined}
                      className={`mx-auto w-full ${
                        workspace.width === "wide"
                          ? "max-w-[960px]"
                          : "max-w-3xl"
                      }`}
                    >
                      {shouldMount &&
                        workspace.sections.map((section, sectionIndex) =>
                          section.heading ===
                            t(
                              "dashboard.profile.publicProfile.sections.howToReachUs",
                            ) && values.accountType !== "business" ? null : (
                            <ProfileFormSectionShell
                              key={section.id || sectionIndex}
                              section={section}
                              sectionIndex={sectionIndex}
                              surface={surface}
                            >
                              <div
                                className={
                                  section.layout?.columns === 2
                                    ? "profile-fields-container"
                                    : ""
                                }
                              >
                                <div
                                  className={
                                    section.layout?.columns === 2
                                      ? "profile-fields-grid"
                                      : ""
                                  }
                                >
                        {section.formFields.map((field, index) => (
                          <div
                            key={field.name || index}
                            className={`mt-3 flex flex-col gap-2 first:mt-0 md:mt-4 ${
                              section.layout?.columns === 2 && field.span === "full"
                                ? "profile-fields-cell-full"
                                : ""
                            }`}
                          >
                            {section.structuralLabel !== "section" &&
                              field.label !== t('dashboard.profile.account.fields.address') &&
                              field.name !== "socialLinks" && (
                                <div className="flex flex-col sm:flex-row gap-1 items-start sm:items-center">
                                  <label className="block text-sm font-medium text-dashboard-light mb-1 leading-tight break-words">
                                    {field.label}
                                    {field.isRequired && (
                                      <span className="font-poppins text-red-500 ml-1">
                                        *
                                      </span>
                                    )}
                                  </label>
                                </div>
                              )}
                            {field.label === t('dashboard.profile.account.fields.address') && (
                              <div className="flex flex-row items-center justify-between">
                                <label className="block text-sm font-medium text-dashboard-light mt-4 mb-1">
                                  {field.label}
                                </label>
                                <Button
                                  startIcon={<CurrLocation size="20px" fill="white" />}
                                  variant="ghost"
                                  type="button"
                                  size="xsmall"
                                  onClickHandler={handleDetectLocation}
                                  className="!rounded-full !bg-blue-500 hover:!bg-blue-600 !p-2 !min-w-0 !w-10 !h-10 !text-white flex items-center justify-center"
                                />
                              </div>
                            )}
                            {field.label === t('dashboard.profile.account.fields.address') ? (
                              <AddressInput
                                setPlaces={(places) => {
                                  setPlaces(places, setFieldValueRef.current || undefined);
                                }}
                                label=""
                                initalValue={initialValues.address}
                                value={address}
                                onChange={handleAddressChange}
                              />
                            ) : field.type === "radio" ? (
                              <div className="flex flex-wrap gap-4 md:gap-10">
                                {field.options?.map((option, index) => (
                                  <div
                                    key={option}
                                    className="flex items-center gap-2"
                                  >
                                    <Field
                                      type="radio"
                                      name={field.name}
                                      value={option}
                                      id={`${field.name}-${option}`}
                                      onChange={(e: any) => {
                                        handleChange(e);
                                        // Mark form as dirty when user changes radio field (only after initialization)
                                        if (isFormInitialized) {
                                          setIsFormDirty(true);
                                        }
                                      }}
                                      className="cursor-pointer accent-blue-500"
                                      style={{ accentColor: '#3498DB' }}
                                    />
                                    <label
                                      htmlFor={`${field.name}-${option}`}
                                      className="text-xs text-white"
                                    >
                                      {field.optionLabels ? field.optionLabels[index] : option}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            ) : field.label === t('dashboard.profile.publicProfile.fields.bio') ? (
                              <div data-field="bio">
                                <TiptapEditor
                                  value={bio || initialValues.bio}
                                  onChange={handleBioChange}
                                />
                              </div>
                            ) : field.type === "custom" && field.components ? (
                              <div className="flex flex-col gap-2">
                                <div className="w-full my-1 rounded-md">
                                  <div className="flex items-center justify-between ">
                                    <h1 className="text-sm text-white">
                                      {field.label}
                                    </h1>
                                  </div>
                                  <div
                                    className="w-full overflow-x-auto"
                                    style={{ scrollbarWidth: "none" }}
                                  >
                                    <div className="flex flex-nowrap py-4 items-center justify-start gap-2">
                                      {taggableFields.map((platform, idx) => {
                                        const getIcon = (platformName: string) => {
                                          // All icons wrapped in a fixed-size container for consistency
                                          const iconWrapper = (icon: ReactNode) => (
                                            <span className="w-4 h-4 flex items-center justify-center shrink-0">
                                              {icon}
                                            </span>
                                          );

                                          switch (platformName) {
                                            case "Instagram":
                                              return <InstagramIcon color="white" />;
                                            case "Whatsapp":
                                              return <WhatsappIcon fill="white" />;
                                            case "Youtube":
                                              return <YoutubeIcon color="white" />;
                                            case "X":
                                              return <TwitterIcon color="white" />;
                                            case "Spotify":
                                              return <Spotify color="white" />;
                                            case "Website":
                                              return <LinkIcon color="white" />;
                                            case "Facebook":
                                              return <FacebookIcon color="white" />;
                                            case "Youtube Music":
                                              return <YoutubeMusic color="white" />;
                                            case "Gmail":
                                              return <Gmail color="white" />;
                                            case "Linkedin":
                                              return <LinkedinIcon color="white" />;
                                            case "Apple Music":
                                              return <AppleMusic color="white" />;
                                            case "Tiktok":
                                              return <TiktokIcon color="white" />;
                                            case "Snapchat":
                                              return <SnapchatIcon color="white" />;
                                            default:
                                              return iconWrapper(<AddIcon size="5" />);
                                          }
                                        };

                                        return (
                                          <button
                                            key={platform || idx}
                                            className={`px-3 py-2 flex flex-row items-center justify-center gap-2 relative font-poppins text-xs rounded-md shrink-0 h-8 whitespace-nowrap ${activeFields.includes(platform)
                                              ? "bg-dashboard-muted text-dashboard border-2 border-dashboard-accent"
                                              : "bg-dashboard-muted text-dashboard"
                                              }`}
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleTagClick(platform);
                                            }}
                                          >
                                            {getIcon(platform)}
                                            <span className="text-xs">{platform}</span>
                                            {activeFields.includes(platform) ? (
                                              <span
                                                className="absolute -right-1 -top-1 w-4 h-4 bg-white rounded-full flex items-center justify-center cursor-pointer text-[hsl(var(--blue-cta))] shrink-0"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleRemoveTag(platform);
                                                }}
                                              >
                                                <CrossIcon size="3" stroke="hsl(var(--blue-cta))" />
                                              </span>
                                            ) : (
                                              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                                                <AddIcon size="5" />
                                              </span>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-4">
                                    {activeFields.map((platform, idx) => {
                                      const getIcon = (platformName: string) => {
                                        switch (platformName) {
                                          case t('dashboard.profile.publicProfile.fields.instagram'):
                                            return <InstagramIcon color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.whatsapp'):
                                            return <WhatsappIcon fill="white" />;
                                          case t('dashboard.home.mobile'):
                                            return <MobileIcon fill="white" />;
                                          case t('dashboard.profile.publicProfile.fields.youtube'):
                                            return <YoutubeIcon color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.x'):
                                            return <TwitterIcon color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.spotify'):
                                            return <Spotify color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.website'):
                                            return <LinkIcon color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.facebook'):
                                            return <FacebookIcon color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.youtubeMusic'):
                                            return <YoutubeMusic color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.gmail'):
                                            return <Gmail color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.linkedin'):
                                            return <LinkedinIcon color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.appleMusic'):
                                            return <AppleMusic color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.tiktok'):
                                            return <TiktokIcon color="white" />;
                                          case t('dashboard.profile.publicProfile.fields.snapchat'):
                                            return <SnapchatIcon color="white" />;
                                          default:
                                            return <AddIcon size="5" />;
                                        }
                                      };

                                      const getFieldName = (platformName: string) => {
                                        switch (platformName) {
                                          case t('dashboard.profile.publicProfile.fields.instagram'):
                                            return "instagramLink";
                                          case t('dashboard.profile.publicProfile.fields.whatsapp'):
                                            return "whatsappLink";
                                          case t('dashboard.home.mobile'):
                                            return "mobilenumberLink";
                                          case t('dashboard.profile.publicProfile.fields.youtube'):
                                            return "youtubeLink";
                                          case t('dashboard.profile.publicProfile.fields.x'):
                                            return "XLink";
                                          case t('dashboard.profile.publicProfile.fields.spotify'):
                                            return "spotifyLink";
                                          case t('dashboard.profile.publicProfile.fields.website'):
                                            return "websiteLink";
                                          case t('dashboard.profile.publicProfile.fields.facebook'):
                                            return "facebookLink";
                                          case t('dashboard.profile.publicProfile.fields.youtubeMusic'):
                                            return "youtubeMusicLink";
                                          case t('dashboard.profile.publicProfile.fields.gmail'):
                                            return "gmailLink";
                                          case t('dashboard.profile.publicProfile.fields.linkedin'):
                                            return "linkedinLink";
                                          case t('dashboard.profile.publicProfile.fields.appleMusic'):
                                            return "appleMusicLink";
                                          case t('dashboard.profile.publicProfile.fields.tiktok'):
                                            return "tiktokLink";
                                          case t('dashboard.profile.publicProfile.fields.snapchat'):
                                            return "snapchatLink";
                                          default:
                                            return platformName.toLowerCase().replace(/\s+/g, "") + "Link";
                                        }
                                      };

                                      return (
                                        <div
                                          className="flex items-center gap-4 w-full"
                                          key={platform || idx}
                                        >
                                          {/* Icon */}
                                          <div className="w-6 h-6 flex items-center justify-center shrink-0">
                                            {getIcon(platform)}
                                          </div>
                                          {/* Label */}
                                          <div className="hidden sm:block min-w-[100px]">
                                            <label className="text-sm text-white">
                                              {platform}
                                            </label>
                                          </div>
                                          {/* Input */}
                                          <div className="flex-1">
                                            <Field
                                              name={getFieldName(platform)}
                                              type="text"
                                              placeholder={platform === "Whatsapp" ? t("dashboard.profile.common.whatsappNumber") : platform}
                                              onChange={(e: any) => {
                                                handleChange(e);
                                                // Mark form as dirty when user changes social media field (only after initialization)
                                                if (isFormInitialized) {
                                                  setIsFormDirty(true);
                                                }
                                              }}
                                              className="w-full placeholder:text-dashboard-muted outline-none p-3 border border-dashboard bg-dashboard-muted font-poppins rounded-md text-sm text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent hover:border-dashboard-accent focus:bg-dashboard-muted"
                                            />
                                            <ErrorMessage
                                              name={getFieldName(platform)}
                                              component="span"
                                              className="text-xs text-red-500 mt-1 block"
                                            />
                                          </div>
                                          {/* Eye Toggle */}
                                          <div className="shrink-0">
                                            <div className="relative">
                                              <Button
                                                onClickHandler={() =>
                                                  handleToggleVisibility(platform)
                                                }
                                                variant="ghost"
                                                size="small"
                                                startIcon={
                                                  visibility[getVisibilityKey(platform)] ? (
                                                    <EyeOnIcon
                                                      stroke="#22c55e"
                                                      size="5"
                                                    />
                                                  ) : (
                                                    <EyeOffIcon
                                                      stroke="var(--dash-danger)"
                                                      size="5"
                                                    />
                                                  )
                                                }
                                                data-tooltip-id={`visibility-tooltip`}
                                                data-tooltip-content={
                                                  visibility[getVisibilityKey(platform)]
                                                    ? t('dashboard.profile.common.visible')
                                                    : t('dashboard.profile.common.hidden')
                                                }
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                  {/* Mobile Field Heading */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <label className="block text-sm font-medium text-dashboard-light">
                                      {t('dashboard.profile.publicProfile.fields.mobile')}
                                    </label>
                                  </div>
                                  {field.components.map(
                                    (item, idx) =>
                                      item.label === t('dashboard.home.mobile') ? (
                                        <div
                                          className="flex items-center gap-2 sm:gap-4 w-full flex-wrap sm:flex-nowrap"
                                          key={item.name || idx}
                                        >
                                          {/* Icon */}
                                          <div className="w-6 h-6 flex items-center justify-center shrink-0">
                                            {item.icon && item.icon}
                                          </div>
                                          {/* Label */}
                                          <div className="hidden sm:block min-w-[100px]">
                                            <label className="text-sm text-white">
                                              {item.label}
                                            </label>
                                          </div>
                                          {/* Input */}
                                          <div className="flex-1 min-w-0">
                                            <PhoneInputWithCountry
                                              value={values.mobilenumberLink || ""}
                                              onChange={(value) => {
                                                setFieldValue("mobilenumberLink", value);
                                                // Mark form as dirty when user changes mobile number (only after initialization)
                                                if (isFormInitialized) {
                                                  setIsFormDirty(true);
                                                }
                                              }}
                                              placeholder={t("dashboard.profile.common.mobileNumberPlaceholder")}
                                              disabled={false}
                                              error={touched.mobilenumberLink && errors.mobilenumberLink ? String(errors.mobilenumberLink) : undefined}
                                            />
                                            <ErrorMessage
                                              name={item.name || ""}
                                              component="span"
                                              className="text-xs text-red-500 mt-1 block"
                                            />
                                          </div>
                                          {/* Eye Toggle - Always visible on all screen sizes */}
                                          <div className="shrink-0 flex items-center">
                                            <div className="relative">
                                              <Button
                                                onClickHandler={() => {
                                                  setIsPublic((prev) => !prev);
                                                  // Mark form as dirty when user changes mobile visibility (only after initialization)
                                                  if (isFormInitialized) {
                                                    setIsFormDirty(true);
                                                  }
                                                }}
                                                variant="ghost"
                                                size="small"
                                                startIcon={
                                                  isPublic ? (
                                                    <EyeOnIcon
                                                      stroke="#22c55e"
                                                      size="5"
                                                    />
                                                  ) : (
                                                    <EyeOffIcon
                                                      stroke="var(--dash-danger)"
                                                      size="5"
                                                    />
                                                  )
                                                }
                                                data-tooltip-id="visibility-tooltip"
                                                data-tooltip-content={
                                                  isPublic ? t('dashboard.profile.common.visible') : t('dashboard.profile.common.hidden')
                                                }
                                                className="min-w-[40px] min-h-[40px] flex items-center justify-center"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      ) : null
                                  )}
                                </div>
                              </div>
                            ) : field.type === "primaryAddressCombined" ? (
                              <>
                                <div className="flex items-center gap-2 mb-2">
                                  <input
                                    type="checkbox"
                                    id="same-as-address"
                                    checked={sameAsAddress}
                                    onChange={(e) =>
                                      handleSameAsAddressChange(e.target.checked, values)
                                    }
                                    className="accent-[hsl(var(--blue-cta))]"
                                  />
                                  <label
                                    htmlFor="same-as-address"
                                    className="text-xs text-white"
                                  >
                                    Same as Address
                                  </label>
                                </div>
                                <AddressInput
                                  type="primaryAddressCombined"
                                  label=""
                                  value={primaryAddressCombined}
                                  onChange={(val) => {
                                    if (!sameAsAddress)
                                      handlePrimaryAddressCombinedChange(val);
                                  }}
                                  placeHolder="City, Country"
                                  setPlaces={(places) => {
                                    if (
                                      !sameAsAddress &&
                                      places &&
                                      places.address_components
                                    ) {
                                      const cityObj =
                                        places.address_components.find(
                                          (comp: any) =>
                                            comp.types.includes("locality") ||
                                            comp.types.includes(
                                              "administrative_area_level_2"
                                            )
                                        );
                                      const countryObj =
                                        places.address_components.find(
                                          (comp: any) =>
                                            comp.types.includes("country")
                                        );
                                      const city = cityObj
                                        ? cityObj.long_name
                                        : "";
                                      const country = countryObj
                                        ? countryObj.long_name
                                        : "";
                                      handlePrimaryAddressCombinedChange(
                                        city && country
                                          ? `${city}, ${country}`
                                          : city || country
                                      );
                                    }
                                  }}
                                  disabled={sameAsAddress}
                                />
                                <ErrorMessage
                                  name={field.name}
                                  component="span"
                                  className="text-xs text-red-500"
                                />
                              </>
                            ) : field.name === "username" ? (
                              <div className="flex flex-col gap-1">
                                <UsernameInput
                                  name={field.name}
                                  label=""
                                  placeholder={field.placeholder}
                                  // Disable during cooldown
                                  disabled={Boolean(usernameDisabled)}
                                  checkAvailability={true}
                                  theme="dark"
                                  hintOnFocus={usernameCooldownMessage}
                                  originalValue={initialValues.username}
                                  onChange={() => {
                                    // Mark form as dirty when user changes username (only after initialization)
                                    if (isFormInitialized) {
                                      setIsFormDirty(true);
                                    }
                                  }}
                                />
                              </div>
                            ) : field.type === "businessLocation" ? (
                              <div className="mt-4">
                                <BusinessLocationFields
                                  values={values}
                                  setFieldValue={(field: string, value: any) => {
                                    setFieldValue(field, value);
                                    // Mark form as dirty when user changes business location fields (only after initialization)
                                    if (isFormInitialized) {
                                      setIsFormDirty(true);
                                    }
                                  }}
                                  onFieldChange={() => {
                                    // Mark form as dirty when user changes business location field inputs (only after initialization)
                                    if (isFormInitialized) {
                                      setIsFormDirty(true);
                                    }
                                  }}
                                />
                              </div>
                            ) : field.type === "theme_settings" ? (
                               <div className="mt-2">
                                 <ThemeAppearanceSection
                                   themeSettings={values.theme_settings || {}}
                                   isActive={
                                     !isWorkspaceMode || activeWorkspace === "appearance"
                                   }
                                   scopeKey={
                                     isWorkspaceMode && scopeKey
                                       ? scopeKey
                                       : "profile-form"
                                   }
                                   onChange={(updated) => {
                                     setFieldValue("theme_settings", updated);
                                     if (isFormInitialized) {
                                       setIsFormDirty(true);
                                     }
                                   }}
                                 />
                               </div>
                             ) : field.type === "feed" ? (
                              <div className="mt-2">
                                 <FeedFields
                                   values={values}
                                   setFieldValue={setFieldValue}
                                   onFeedDataChange={onFeedDataChange}
                                   onAsyncStateChange={handleFeedAsyncStateChange}
                                   showHeading={section.structuralLabel !== "section"}
                                   onFormDirtyChange={() => {
                                    // Mark form as dirty when user interacts with feed fields (only after initialization)
                                    if (isFormInitialized) {
                                      setIsFormDirty(true);
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <>
                                <Field
                                  name={field.name}
                                  type={field.type}
                                  as={field.as}
                                  placeholder={field.placeholder}
                                  data-field={field.name}
                                  onChange={(e: any) => {
                                    handleChange(e);
                                    // Mark form as dirty when user changes any field
                                    setIsFormDirty(true);
                                  }}
                                  className={`w-full placeholder:text-dashboard-muted ${field.as === "textarea" &&
                                    "h-32 resize-none text-xs"
                                    } outline-none p-3 border border-dashboard bg-dashboard-muted font-poppins rounded-md text-sm text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent hover:border-dashboard-accent focus:bg-dashboard-muted`}
                                />
                                <ErrorMessage
                                  name={field.name}
                                  component="span"
                                  className="text-xs text-red-500"
                                />
                              </>
                            )}
                          </div>
                        ))}
                                </div>
                              </div>
                            </ProfileFormSectionShell>
                          ),
                        )}
                    </section>
                  );
                })}
              </div>
              <ProfileFormActions
                onRegisterSubmit={onRegisterSubmit}
                submit={formHandleSubmit}
                isSaving={isSaving}
                placement={actionsPlacement}
              />
              {/* Global Tooltip Component */}
              {isDesktop && (
                <Tooltip
                  id="visibility-tooltip"
                  place="right"
                  style={{ fontSize: "12px" }}
                />
              )}
            </Form>
          );
        }}
      </Formik>
    );
  }
);

const ProfileForm: FC<ProfileFormProps> = memo((props) => (
  <ProfileFormSession
    key={props.mode === "workspaces" ? props.scopeKey : "single"}
    {...props}
  />
));

ProfileForm.displayName = "ProfileForm";

export default ProfileForm;

import { Formik, Form, Field, ErrorMessage, FormikHelpers } from "formik";
import { FC, memo, ReactNode } from "react";
import * as Yup from "yup";
import Button from "../../../components/ui/Button";
import { FormValues } from "../data";
import GoogleIcon from "../../../assets/icons/GoogleIcon";
import UsernameInput from "../../../components/ui/UsernameInput";
import OnboardingUsernameInput from "../../../components/ui/OnboardingUsernameInput";
import PasswordInput from "../../../components/ui/PasswordInput";
import AddressInput from "../../Profile/components/AddressInput";
import { useTranslation } from "react-i18next";
import PhoneInputWithCountry from "../../../components/ui/PhoneInputWithCountry";
import { Turnstile } from '@marsidev/react-turnstile';

export type { AuthFormField };
// Types for form fields
interface AuthFormField {
  name: string;
  label: string;
  type: string;
  as?: string;
  options?: string[] | { value: string; label: string }[];
  placeholder?: string;
  helperText?: string; // Added support for helper text
}

// Props for AuthForm component
interface AuthFormProps {
  initialValues: FormValues;
  heading: string;
  description?: string;
  validationSchema: Yup.ObjectSchema<FormValues>;
  onSubmit: (
    values: FormValues,
    formikHelpers: FormikHelpers<FormValues>
  ) => void | Promise<void>;
  formFields: AuthFormField[];
  submitButtonLabel?: string;
  isLoading?: boolean;
  errorMessage?: string;
  successMessage?: string;
  children?: ReactNode;
  GoogleAuthHandler?: () => void;
  googleButtonLabel?: string;
  isRegistration?: boolean; // New prop to determine if this is a registration form
  isOnboarding?: boolean; // New prop to determine if this is an onboarding form
  enablePasswordValidation?: boolean; // New prop to control password validation
  turnstileSiteKey?: string; // New prop for Cloudflare Turnstile
  formId?: string; // Optional id so an external button can submit this form (onboarding footer)
}

const AuthForm: FC<AuthFormProps> = memo(
  ({
    initialValues,
    heading,
    description,
    validationSchema,
    onSubmit,
    GoogleAuthHandler,
    formFields,
    submitButtonLabel = "Submit",
    isLoading = false,
    errorMessage,
    successMessage,
    children,
    googleButtonLabel = "Sign in with Google",
    isRegistration = false, // Default to false (login form)
    isOnboarding = false, // Default to false (not onboarding)
    enablePasswordValidation = false, // Default to false for login forms
    turnstileSiteKey, // Site key for Cloudflare Turnstile
    formId, // External-submit hook for the onboarding footer
  }) => {
    const { t } = useTranslation();

    // Use localized versions if no custom labels provided
    const finalSubmitButtonLabel =
      submitButtonLabel === "Submit" ? t("common.submit") : submitButtonLabel;
    const finalGoogleButtonLabel =
      googleButtonLabel === "Sign in with Google"
        ? t("common.signInWithGoogle")
        : googleButtonLabel;

    // Helper function to check if a field is required
    const isFieldRequired = (fieldName: string) => {
      if (!isOnboarding) return false;

      // Define required fields for onboarding steps
      const requiredFields = [
        "accountName",
        "username",
        "bio",
        "accountType", // Account Details step
        "mobile_number", // Contact Details step
        "address",
        "city",
        "state",
        "country",
        "postalCode",
        "primaryAddress", // Address Details step
      ];

      return requiredFields.includes(fieldName);
    };
    return (
      <div className="dashboard-theme">
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={async (values, formikHelpers) => {
            await onSubmit(values, formikHelpers);
          }}
          enableReinitialize={false}
          validateOnChange={false}
          validateOnBlur={false}
          validateOnSubmit={true}
          resetForm={false}
        >
          {({ isSubmitting, values, setFieldValue, setFieldTouched, touched, errors }) => (
            <Form
              id={formId}
              className={`font-poppins flex flex-col gap-4 w-full text-dashboard ${
                isOnboarding
                  ? "" // onboarding steps sit directly in the outer card — no nested box
                  : "bg-dashboard-sidebar p-6 rounded-3xl shadow-dashboard-elevated mb-4 md:mb-6"
              }`}
            >
              {/* In onboarding the step title/subtitle are shown by the progress
                  bar, so hide the duplicate heading here. */}
              {!isOnboarding && (
                <div className=" font-poppins">
                  <h1 className="font-semibold text-2xl text-white">{heading}</h1>
                  <p className="text-sm mt-1 text-gray-300">{description}</p>
                </div>
              )}
              <div className=" flex flex-col gap-2 md:gap-6 ">
                {formFields.map((field) => (
                  <div key={field.name} className="flex flex-col gap-2">
                    {field.name === "username" && isRegistration ? (
                      <div className="flex flex-col gap-1">
                        <UsernameInput
                          name={field.name}
                          label={field.label}
                          placeholder={field.placeholder}
                          checkAvailability={true}
                          theme="dark"
                        />
                        {field.helperText && (
                          <p className="text-xs font-poppins text-gray-300">
                            {field.helperText}
                          </p>
                        )}
                      </div>
                    ) : field.name === "username" && isOnboarding ? (
                      <OnboardingUsernameInput
                        name={field.name}
                        label={field.label}
                        placeholder={field.placeholder}
                        helperText={field.helperText}
                        isPreFilled={!!initialValues[field.name]} // Check if field was pre-filled
                      />
                    ) : field.name === "username" ? (
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={field.name}
                          className="block text-sm font-poppins text-white font-semibold mb-1"
                        >
                          {field.label}
                          {isFieldRequired(field.name) && (
                            <span className="text-red-400 ml-1">*</span>
                          )}
                        </label>
                        <Field
                          type="text"
                          name={field.name}
                          placeholder={field.placeholder}
                          className="w-full placeholder:text-gray-400 outline-none px-3 py-2 border border-dashboard bg-dashboard-muted font-poppins rounded-md text-sm text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent hover:border-dashboard-accent"
                        />
                        {field.helperText && (
                          <p className="text-xs font-poppins text-gray-300">
                            {field.helperText}
                          </p>
                        )}
                        <ErrorMessage
                          name={field.name}
                          component="span"
                          className="text-xs font-poppins text-red-400"
                        />
                      </div>
                    ) : field.type === "radio" ||
                      field.type === "customRadio" ? (
                      // Radio button fields
                      <>
                        <label className="block text-sm font-poppins text-white font-semibold mb-1">
                          {field.label}
                          {isFieldRequired(field.name) && (
                            <span className="text-red-400 ml-1">*</span>
                          )}
                        </label>
                        <div className="flex flex-wrap gap-4 md:gap-10">
                          {field.options?.map((option) => {
                            const value =
                              typeof option === "string"
                                ? option
                                : option.value;
                            const label =
                              typeof option === "string"
                                ? option
                                : option.label;
                            return (
                              <div
                                key={value}
                                className="flex items-center gap-2 "
                              >
                                <Field
                                  type="radio"
                                  name={field.name}
                                  value={value}
                                  id={`${field.name}-${value}`}
                                  className="cursor-pointer accent-purple"
                                />
                                <label
                                  htmlFor={`${field.name}-${value}`}
                                  className="text-xs text-white"
                                >
                                  {label}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                        <ErrorMessage
                          name={field.name}
                          component="span"
                          className="text-xs font-poppins text-red-400 mt-1"
                        />
                      </>
                    ) : field.type === "password" ? (
                      // Enhanced password fields with validation (only for registration/reset forms)
                      enablePasswordValidation ? (
                        <div className="w-full">
                          <PasswordInput
                            value={(values[field.name] as string) || ""}
                            onChange={(value) =>
                              setFieldValue(field.name, value)
                            }
                            label={field.label}
                            placeholder={field.placeholder}
                            currentPassword={
                              field.name === "password" &&
                                values.currentPassword
                                ? (values.currentPassword as string)
                                : undefined
                            }
                            showStrengthMeter={field.name === "password"} // Show strength meter for main password field
                            showValidationStatus={field.name === "password"} // Show validation status only for main password field
                            required={isFieldRequired(field.name)}
                            className="w-full"
                            labelColor="white"
                            data-testid={`${field.name}-input`}
                          />

                          {/* Password match indicator for confirm password field */}
                          {field.name === "confirmPassword" &&
                            values.confirmPassword &&
                            values.password && (
                              <div className="mt-2">
                                {values.password === values.confirmPassword ? (
                                  <div className="flex items-center text-green-400 text-xs">
                                    <svg
                                      className="w-3 h-3 mr-1"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    <span>
                                      {t(
                                        "auth.validations.confirmPassword.match"
                                      )}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center text-red-400 text-xs">
                                    <svg
                                      className="w-3 h-3 mr-1"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    <span>
                                      {t(
                                        "auth.validations.confirmPassword.mustMatch"
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                          <ErrorMessage
                            name={field.name}
                            component="span"
                            className="text-xs font-poppins text-red-400 mt-1"
                          />
                        </div>
                      ) : (
                        // Regular password input for login (no validation) with visibility toggle
                        <div className="w-full">
                          <PasswordInput
                            value={(values[field.name] as string) || ""}
                            onChange={(value) =>
                              setFieldValue(field.name, value)
                            }
                            label={field.label}
                            placeholder={field.placeholder}
                            showStrengthMeter={false}
                            showValidationStatus={false}
                            required={isFieldRequired(field.name)}
                            className="w-full"
                            labelColor="white"
                            data-testid={`${field.name}-input`}
                          />
                          <ErrorMessage
                            name={field.name}
                            component="span"
                            className="text-xs font-poppins text-red-400 mt-1"
                          />
                        </div>
                      )
                    ) : field.name === "address" ? (
                      // Google Places Autocomplete for address field
                      <div className="flex flex-col gap-1">
                        <AddressInput
                          type="address"
                          label={field.label}
                          value={(values[field.name] as string) || ""}
                          onChange={(value) => setFieldValue(field.name, value)}
                          placeHolder={field.placeholder}
                        />
                        {field.helperText && (
                          <p className="text-xs font-poppins text-gray-300">
                            {field.helperText}
                          </p>
                        )}
                        {errors[field.name] && touched[field.name] && (
                          <span className="text-xs font-poppins text-red-400">
                            {errors[field.name]}
                          </span>
                        )}
                      </div>
                    ) : field.name === "mobile_number" && isOnboarding ? (
                      // Special phone input with country dropdown for onboarding
                      <PhoneInputWithCountry
                        value={(values[field.name] as string) || ""}
                        onChange={(value) => setFieldValue(field.name, value)}
                        onBlur={() => setFieldTouched(field.name, true)}
                        placeholder={field.placeholder}
                        label={field.label}
                        helperText={field.helperText}
                        required={isFieldRequired(field.name)}
                        error={
                          touched[field.name] && errors[field.name]
                            ? (errors[field.name] as string)
                            : undefined
                        }
                      />
                    ) : (
                      // Regular input fields
                      <>
                        <label
                          htmlFor={field.name}
                          className="block text-sm font-poppins text-white font-semibold mb-1"
                        >
                          {field.label}
                          {isFieldRequired(field.name) && (
                            <span className="text-red-400 ml-1">*</span>
                          )}
                        </label>
                        <Field
                          name={field.name}
                          as={field.as}
                          type={field.type}
                          placeholder={field.placeholder}
                          className={`w-full placeholder:text-gray-400 outline-none px-3 py-2 border border-dashboard bg-dashboard-muted font-poppins rounded-md text-sm text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent hover:border-dashboard-accent ${field.type === "textarea" ? "h-32 resize-none" : ""
                            }`}
                          autoComplete={
                            field.type === "email"
                              ? "email"
                              : field.type === "text" &&
                                field.name === "username"
                                ? "username"
                                : field.name === "phone"
                                  ? "tel"
                                  : "off"
                          }
                        />
                        <ErrorMessage
                          name={field.name}
                          component="span"
                          className="text-xs font-poppins text-red-400"
                        />
                      </>
                    )}
                  </div>
                ))}
                {errorMessage && (
                  <div className="p-3 bg-red-900/20 border border-red-400/30 rounded-md">
                    <p className="text-sm font-poppins text-red-400">
                      {errorMessage}
                    </p>
                  </div>
                )}

                {successMessage && (
                  <div className="p-3 bg-green-900/20 border border-green-400/30 rounded-md">
                    <p className="text-sm font-poppins text-green-400">
                      {successMessage}
                    </p>
                  </div>
                )}
              </div>

              {isRegistration && (
                <div className="flex items-start gap-2">
                  <Field
                    type="checkbox"
                    name="termsAccepted"
                    id="termsAccepted"
                    className="mt-1 cursor-pointer accent-dashboard-accent"
                  />
                  <label
                    htmlFor="termsAccepted"
                    className="text-xs font-poppins text-gray-300 cursor-pointer"
                  >
                    {t("auth.acceptTerms")}{" "}
                    <a
                      href="/terms?return=/register"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dashboard-accent underline hover:text-dashboard-accent/80"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("auth.termsAndConditions")}
                    </a>
                  </label>
                </div>
              )}
              {isRegistration && (
                <ErrorMessage
                  name="termsAccepted"
                  component="span"
                  className="text-xs font-poppins text-red-400 -mt-2"
                />
              )}

              {turnstileSiteKey && (
                <div className="flex flex-col gap-1 w-full items-center mt-2 mb-2">
                  <Turnstile 
                    siteKey={turnstileSiteKey} 
                    onSuccess={(token: string) => setFieldValue("turnstileToken", token)} 
                    onError={() => setFieldValue("turnstileToken", "")}
                    onExpire={() => setFieldValue("turnstileToken", "")}
                    options={{
                      theme: 'dark'
                    }}
                  />
                  <ErrorMessage
                    name="turnstileToken"
                    component="span"
                    className="text-xs font-poppins text-red-400 text-center w-full"
                  />
                </div>
              )}

              {/* In onboarding the primary action lives in the pinned footer,
                  which submits this form via its formId — so hide this button. */}
              {!isOnboarding && (
                <Button
                  btnText={
                    isSubmitting || isLoading
                      ? t("auth.validations.general.processing")
                      : finalSubmitButtonLabel
                  }
                  size="small"
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting || isLoading}
                />
              )}

              {GoogleAuthHandler && (
                <>
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex-grow border-t border-white/15"></div>
                    <p className="font-poppins text-sm px-2">{t("auth.or")}</p>
                    <div className="flex-grow border-t border-white/15"></div>
                  </div>

                  <Button
                    btnText={finalGoogleButtonLabel}
                    size="small"
                    type="button"
                    endIcon={<GoogleIcon />}
                    variant="google"
                    onClickHandler={GoogleAuthHandler}
                  />
                </>
              )}
              {children}
            </Form>
          )}
        </Formik>
      </div>
    );
  }
);

export default AuthForm;

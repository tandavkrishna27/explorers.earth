import * as Yup from "yup";
import { validateUsername } from "../../utils/usernameValidation";
import { TFunction } from "i18next";

// Generic type for defining form data
export type FormValues = {
  [key: string]: string | boolean;
};

// Custom Yup method for username validation
export const createUsernameValidation = (t: TFunction) => Yup.string()
  .required(t('auth.validations.username.required'))
  .test('username-validation', t('auth.validations.username.invalidChars'), function(value) {
    if (!value) return false;
    
    const validation = validateUsername(value, t);
    
    if (!validation.isValid) {
      // Map validation errors to i18n keys
      const errorMap: { [key: string]: string } = {
        'Username is required': t('auth.validations.username.required'),
        'Username must be at least 3 characters long': t('auth.validations.username.minLength'),
        'Username must not exceed 30 characters': t('auth.validations.username.maxLength'),
        'Username can only contain lowercase letters (a-z), numbers (0-9), and hyphens (-)': t('auth.validations.username.invalidChars'),
        'Username must start with a letter (a-z)': t('auth.validations.username.mustStartWithLetter'),
        'Username cannot start or end with a hyphen': t('auth.validations.username.cannotStartEndHyphen'),
        'Username cannot contain consecutive hyphens': t('auth.validations.username.noConsecutiveHyphens'),
        'Username cannot be all numbers': t('auth.validations.username.cannotBeAllNumbers'),
        'This username contains reserved words and cannot be used': t('auth.validations.username.reservedWords'),
        'Username contains inappropriate content': t('auth.validations.username.inappropriateContent'),
        'Username already exists': t('auth.validations.username.alreadyExists')
      };
      
      const errorMessage = validation.errors[0] || t('auth.validations.onboarding.invalidUsername');
      const translatedError = errorMap[errorMessage] || errorMessage;
      
      return this.createError({
        message: translatedError
      });
    }
    
    return true;
  });

// Validation schema
export const createLoginValidationSchema = (t: TFunction) => Yup.object({
  username: Yup.string().required(t('auth.validations.login.usernameOrEmailRequired')),
  password: Yup.string()
    .min(6, t('auth.validations.password.minLength'))
    .required(t('auth.validations.password.required')),
});

// Initial values for form fields
export const loginInitialValues = {
  username: "",
  password: "",
};

// Validation schema for Register
export const createRegisterValidationSchema = (t: TFunction) => {
  const schema: any = {
    username: createUsernameValidation(t),
    email: Yup.string()
      .email(t('auth.validations.email.invalidFormat'))
      .required(t('auth.validations.email.required')),
    password: Yup.string()
      .required(t('auth.validations.password.required'))
      .min(6, t('auth.validations.password.minLength'))
      .matches(/[A-Z]/, t('auth.validations.password.uppercaseRequired'))
      .matches(/[a-z]/, t('auth.validations.password.lowercaseRequired'))
      .matches(/[0-9]/, t('auth.validations.password.numberRequired'))
      .matches(/[!@#$%^&*().,?":{}|<>]/, t('auth.validations.password.specialCharRequired')),
    confirmPassword: Yup.string()
      .oneOf([Yup.ref('password')], t('auth.validations.confirmPassword.mustMatch'))
      .required(t('auth.validations.confirmPassword.confirmRequired')),
    termsAccepted: Yup.boolean()
      .oneOf([true], t('auth.validations.termsAccepted.required')),
  };

  // Only require Turnstile if the site key is provided in the env
  if (import.meta.env.VITE_TURNSTILE_SITE_KEY) {
    schema.turnstileToken = Yup.string().required(t('auth.validations.turnstile.required', { defaultValue: 'Please complete the security check' }));
  }

  return Yup.object(schema);
};

// Initial values for form fields
export const registerInitialValues = {
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  termsAccepted: false,
  turnstileToken: ""
};

// Translation functions for form fields
export const getLoginFormFields = (t: TFunction) => [
  {
    name: "username",
    label: t('auth.usernameOrEmail'),
    type: "text",
    placeholder: t('auth.usernameOrEmailPlaceholder'),
  },
  {
    name: "password",
    label: t('auth.password'),
    type: "password",
    placeholder: t('auth.passwordPlaceholder'),
  },
];

export const getRegisterFormFields = (t: TFunction) => [
  {
    name: "username",
    label: t('auth.username'),
    type: "text",
    placeholder: t('auth.usernamePlaceholder'),
  },
  {
    name: "email",
    label: t('auth.email'),
    type: "text",
    placeholder: t('auth.emailPlaceholder'),
  },
  {
    name: "password",
    label: t('auth.password'),
    type: "password",
    placeholder: t('auth.passwordPlaceholder'),
  },
  {
    name: "confirmPassword",
    label: t('auth.confirmPassword'),
    type: "password",
    placeholder: t('auth.confirmPasswordPlaceholder'),
  }
];

export const onboardingInitialValues = {
  accountName: "",
  username: "",
  bio: "",
  mobile_number: "",
  city: "",
  country: "",
  primaryLocation: "",
  accountType: "",
};

export const createOnboardingValidationSchema = (t: TFunction) => Yup.object({
  accountName: Yup.string()
    .required(t('auth.validations.onboarding.displayNameRequired'))
    .min(3, t('auth.validations.onboarding.displayNameMinLength')),
  username: createUsernameValidation(t),
  bio: Yup.string()
    .required(t('auth.validations.onboarding.bioRequired'))
    .max(250, t('auth.validations.onboarding.bioMaxLength')),
  mobile_number: Yup.string()
    .required(t('auth.validations.onboarding.mobileNumberRequired'))
    .matches(/^[0-9]+$/, t('auth.validations.onboarding.mobileNumberInvalid'))
    .min(10, t('auth.validations.onboarding.mobileNumberLength'))
    .max(15, t('auth.validations.onboarding.mobileNumberLength')),
  city: Yup.string().required(t('auth.validations.onboarding.cityRequired')),
  country: Yup.string().required(t('auth.validations.onboarding.countryRequired')),
  primaryLocation: Yup.string().required(t('auth.validations.onboarding.primaryAddressRequired')),
  accountType: Yup.string()
    .oneOf([t('auth.validations.accountType.personal'), t('auth.validations.accountType.creator'), t('auth.validations.accountType.business')], t('auth.validations.accountType.invalid'))
    .required(t('auth.validations.accountType.required')),
});

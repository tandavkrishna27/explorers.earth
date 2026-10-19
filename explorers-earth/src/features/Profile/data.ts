import * as Yup from "yup";
import { TFunction } from "i18next";
import { validateUsername } from "../../utils/usernameValidation";

// Custom Yup method for username validation
export const createUsernameValidation = (t: TFunction, currentUsername?: string | null) => Yup.string()
  .required(t('auth.validations.username.required'))
  .test('username-validation', t('auth.validations.username.invalidChars'), function(value) {
    if (!value) return false;
    // Only a handle being chosen is held to the rules; the one already held stays savable.
    if (currentUsername && value.trim().toLowerCase() === currentUsername.trim().toLowerCase()) return true;
    
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
      
      const errorMessage = validation.errors[0] || 'Invalid username';
      const translatedError = errorMap[errorMessage] || errorMessage;
      
      return this.createError({
        message: translatedError
      });
    }
    
    return true;
  });

// validation schema for Profile form
export const createProfileValidationSchema = (t: TFunction, currentUsername?: string | null): Yup.AnySchema => Yup.object().shape({
  username: createUsernameValidation(t, currentUsername),
  accountName: Yup.string()
    .required(t('auth.validations.accountName.required'))
    .min(2, t('auth.validations.accountName.minLength'))
    .max(50, t('auth.validations.accountName.maxLength'))
    .matches(
      /^[a-zA-Z\s'\-.]+$/,
      t('auth.validations.accountName.invalidChars')
    )
    .test(
      'no-numbers',
      t('auth.validations.accountName.noNumbers'),
      (value) => {
        if (!value) return true; // Let required validation handle empty values
        return !/\d/.test(value); // Returns false if any digit is found
      }
    ),
  accountType: Yup.string()
    .oneOf(["personal", "creator", "business"], t('auth.validations.accountType.invalid'))
    .required(t('auth.validations.accountType.required')),
  bio: Yup.string(),
  streetNumber: Yup.string(),
  streetName: Yup.string(),
  city: Yup.string(),
  state: Yup.string(),
  postalCode: Yup.string(),
  country: Yup.string(),
  address: Yup.string(),
  primaryAddressCombined: Yup.string().required(t('auth.validations.primaryAddress.required')),

  // Social Media Validations - Optional fields that only validate when filled
  instagramLink: Yup.string()
    .test('is-valid-instagram', t('auth.validations.socialMedia.instagram'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?(?:[?#].*)?$/.test(value);
    }),
  whatsappLink: Yup.string()
    .test(
      'is-valid-whatsapp',
      t('auth.validations.socialMedia.whatsapp'),
      function (value) {
        if (!value || value.trim() === '') return true; // Allow empty values
        const v = value.trim();
        // Accept E.164-like number: optional +, total 8-15 digits
        const phone = /^\+?[1-9]\d{7,14}$/;
        // Accept wa.me link (with or without protocol)
        const waMe = /^(?:https?:\/\/)?wa\.me\/[0-9]{7,15}(?:[/?].*)?$/i;
        // Accept api.whatsapp.com send link (with or without protocol)
        const apiWa = /^(?:https?:\/\/)?api\.whatsapp\.com\/send\?phone=[0-9]{7,15}(?:&.*)?$/i;
        return phone.test(v) || waMe.test(v) || apiWa.test(v);
      }
    ),
  mobilenumberLink: Yup.string()
    .test('is-valid-mobile', t('auth.validations.socialMedia.mobile'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^\+?[1-9]\d{1,14}$/.test(value);
    }),
  youtubeLink: Yup.string()
    .test('is-valid-youtube', t('auth.validations.socialMedia.youtube'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:c\/|channel\/|user\/|@)?[a-zA-Z0-9_-]+|youtu\.be\/[a-zA-Z0-9_-]+)(?:\/)?(?:[?#].*)?$/.test(value);
    }),
  XLink: Yup.string()
    .test('is-valid-x', t('auth.validations.socialMedia.x'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+(?:\/)?(?:[?#].*)?$/.test(value);
    }),
  spotifyLink: Yup.string()
    .test('is-valid-spotify', t('auth.validations.socialMedia.spotify'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:open\.)?spotify\.com\/(?:artist|user|playlist|album|track)\/[a-zA-Z0-9]+(?:\/)?(?:[?#].*)?$/.test(value);
    }),
  websiteLink: Yup.string()
    .test('is-valid-website', t('auth.validations.socialMedia.website'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/.test(value);
    }),
  facebookLink: Yup.string()
    .test('is-valid-facebook', t('auth.validations.socialMedia.facebook'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:www\.)?facebook\.com\/[a-zA-Z0-9.]+(?:\/)?(?:[?#].*)?$/.test(value);
    }),
  youtubeMusicLink: Yup.string()
    .test('is-valid-youtube-music', t('auth.validations.socialMedia.youtubeMusic'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:music\.)?youtube\.com\/(?:channel|user)\/[a-zA-Z0-9_-]+(?:\/)?(?:[?#].*)?$/.test(value);
    }),
  gmailLink: Yup.string()
    .test('is-valid-email', t('auth.validations.socialMedia.email'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }),
  linkedinLink: Yup.string()
    .test('is-valid-linkedin', t('auth.validations.socialMedia.linkedin'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|company)\/[a-zA-Z0-9-]+(?:\/)?(?:[?#].*)?$/.test(value);
    }),
  appleMusicLink: Yup.string()
    .test('is-valid-apple-music', t('auth.validations.socialMedia.appleMusic'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:music\.)?apple\.com\/(?:[a-z]{2}\/)?(?:artist|album|playlist)\/[^/]+\/[0-9]+(?:\/)?(?:[?#].*)?$/.test(value);
    }),
  tiktokLink: Yup.string()
    .test('is-valid-tiktok', t('auth.validations.socialMedia.tiktok'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[a-zA-Z0-9._]+(?:\/)?(?:[?#].*)?$/.test(value);
    }),
  snapchatLink: Yup.string()
    .test('is-valid-snapchat', t('auth.validations.socialMedia.snapchat'), function(value) {
      if (!value || value.trim() === '') return true; // Allow empty values
      return /^(?:https?:\/\/)?(?:www\.)?snapchat\.com\/add\/[a-zA-Z0-9._-]+(?:\/)?(?:[?#].*)?$/.test(value);
    }),
});

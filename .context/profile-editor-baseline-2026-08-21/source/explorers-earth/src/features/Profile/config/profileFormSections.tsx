import InstagramIcon from "../../../assets/icons/InstagramIcon";
import WhatsappIcon from "../../../assets/icons/WhatsappIcon";
import MobileIcon from "../../../assets/icons/MobileIcon";
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
import type { FormSection } from "../components/ProfileForm";

type Translate = (key: string) => string;

export const getProfileFields = (t: Translate): FormSection[] => [
  {
    heading: t("dashboard.profile.publicProfile.sections.profileInformation"),
    formFields: [
      {
        name: "bio",
        label: t("dashboard.profile.publicProfile.fields.bio"),
        type: "textarea",
        as: "textarea",
      },
      {
        name: "accountName",
        label: t("dashboard.profile.account.fields.accountName"),
        type: "text",
        isRequired: true,
      },
      {
        name: "primaryAddressCombined",
        label: t("dashboard.profile.publicProfile.fields.primaryAddress"),
        type: "primaryAddressCombined",
        isRequired: true,
      },
    ],
  },
  {
    heading: t("dashboard.profile.publicProfile.sections.socialMedia"),
    formFields: [
      {
        name: "socialLinks",
        label: t("dashboard.profile.publicProfile.fields.socialMedia"),
        type: "custom",
        components: [
          {
            icon: <InstagramIcon color="white" />,
            label: t("dashboard.profile.publicProfile.fields.instagram"),
            name: "instagramLink",
            type: "text",
          },
          {
            icon: <MobileIcon fill="white" />,
            label: t("dashboard.home.mobile"),
            name: "mobilenumberLink",
            type: "text",
          },
          {
            icon: <WhatsappIcon fill="white" />,
            label: t("dashboard.profile.publicProfile.fields.whatsapp"),
            name: "whatsappLink",
            type: "text",
          },
          {
            icon: <YoutubeIcon color="white" />,
            label: t("dashboard.profile.publicProfile.fields.youtube"),
            name: "youtubeLink",
            type: "text",
          },
          {
            icon: <TwitterIcon color="white" />,
            label: t("dashboard.profile.publicProfile.fields.x"),
            name: "XLink",
            type: "text",
          },
          {
            icon: <Spotify color="white" />,
            label: t("dashboard.profile.publicProfile.fields.spotify"),
            name: "spotifyLink",
            type: "text",
          },
          {
            icon: <LinkIcon color="white" />,
            label: t("dashboard.profile.publicProfile.fields.website"),
            name: "websiteLink",
            type: "text",
          },
          {
            icon: <FacebookIcon color="white" />,
            label: t("dashboard.profile.publicProfile.fields.facebook"),
            name: "facebookLink",
            type: "text",
          },
          {
            icon: <YoutubeMusic color="white" />,
            label: t("dashboard.profile.publicProfile.fields.youtubeMusic"),
            name: "youtubeMusicLink",
            type: "text",
          },
          {
            icon: <Gmail color="white" />,
            label: t("dashboard.profile.publicProfile.fields.gmail"),
            name: "gmailLink",
            type: "text",
          },
          {
            icon: <LinkedinIcon color="white" />,
            label: t("dashboard.profile.publicProfile.fields.linkedin"),
            name: "linkedinLink",
            type: "text",
          },
          {
            icon: <AppleMusic color="white" />,
            label: t("dashboard.profile.publicProfile.fields.appleMusic"),
            name: "appleMusicLink",
            type: "text",
          },
          {
            icon: <TiktokIcon color="white" />,
            label: t("dashboard.profile.publicProfile.fields.tiktok"),
            name: "tiktokLink",
            type: "text",
          },
          {
            icon: <SnapchatIcon color="white" />,
            label: t("dashboard.profile.publicProfile.fields.snapchat"),
            name: "snapchatLink",
            type: "text",
          },
        ],
      },
    ],
  },
  {
    heading: t("dashboard.profile.publicProfile.sections.howToReachUs"),
    description: t(
      "dashboard.profile.publicProfile.sections.howToReachUsDescription",
    ),
    formFields: [
      {
        name: "businessLocation",
        label: t("dashboard.profile.publicProfile.fields.businessLocation"),
        type: "businessLocation",
        isRequired: false,
      },
    ],
  },
];

export const getGalleryFields = (t: Translate): FormSection[] => [
  {
    heading: t("dashboard.profile.publicProfile.sections.feed"),
    formFields: [
      {
        name: "feed",
        label: t("dashboard.profile.publicProfile.fields.feed"),
        type: "feed",
        isRequired: false,
      },
    ],
  },
];

export const getAppearanceFields = (_t: Translate): FormSection[] => [
  {
    heading: "Theme & Appearance",
    formFields: [
      {
        name: "theme_settings",
        label: "Theme & Appearance",
        type: "theme_settings",
        isRequired: false,
      },
    ],
  },
];

export const getAccountSettingsFields = (t: Translate): FormSection[] => [
  {
    heading: t("dashboard.profile.account.sections.account"),
    formFields: [
      {
        name: "username",
        label: t("dashboard.profile.account.fields.username"),
        type: "text",
        isRequired: true,
      },
      {
        name: "accountType",
        label: t("dashboard.profile.publicProfile.fields.accountType"),
        type: "radio",
        isRequired: true,
        options: ["personal", "creator", "business"],
        optionLabels: [
          t("dashboard.profile.publicProfile.accountTypes.personal"),
          t("dashboard.profile.publicProfile.accountTypes.creator"),
          t("dashboard.profile.publicProfile.accountTypes.business"),
        ],
      },
    ],
  },
];

export const getBillingAddressFields = (t: Translate): FormSection[] => [
  {
    heading: t("dashboard.profile.account.sections.billingAddress"),
    formFields: [
      {
        name: "address",
        label: t("dashboard.profile.account.fields.address"),
        type: "text",
      },
      {
        name: "streetName",
        label: t("dashboard.profile.account.fields.streetName"),
        type: "text",
      },
      {
        name: "state",
        label: t("dashboard.profile.account.fields.state"),
        type: "text",
      },
      {
        name: "city",
        label: t("dashboard.profile.account.fields.city"),
        type: "text",
      },
      {
        name: "country",
        label: t("dashboard.profile.account.fields.country"),
        type: "text",
      },
      {
        name: "postalCode",
        label: t("dashboard.profile.account.fields.postalCode"),
        type: "text",
      },
    ],
  },
];

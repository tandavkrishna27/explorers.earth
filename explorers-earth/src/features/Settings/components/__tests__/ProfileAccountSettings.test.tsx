import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { explorersApiClient } from "../../../../lib/explorersApiClient";

const { authState, harness, updateSubmit, updateTargets, toastError, toastSuccess } = vi.hoisted(() => ({
  authState: {
    generation: 0,
    user: {
      id: "user-1",
      documentId: "user-doc",
      username: "tk2727",
    } as any,
  },
  harness: {
    profileFormProps: undefined as any,
    usernameModalProps: undefined as any,
  },
  updateSubmit: vi.fn(),
  updateTargets: [] as Array<string | undefined>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const account = {
  id: "11111111-1111-4111-8111-111111111111",
  handle: "tk2727",
  displayName: "TK Explorer",
  accountType: "Creator",
  onboardingStatus: "complete",
  status: "active",
  revision: 4,
  publicProfile: true,
  autoPinning: true,
  locale: "en",
  bioPlain: "Public bio",
  bioRich: null,
  additionalAddresses: [{
    address: "Stored billing address",
    streetName: "Stored Street",
    city: "Hyderabad",
    state: "Telangana",
    country: "India",
    postalCode: "500001",
  }],
  primaryAddress: { address: "Hyderabad, India" },
  publicAddress: { title: "Studio", placeId: "place-1", places: null },
  profilePlaceDetails: null,
  categories: [],
  feedItems: [{ id: "22222222-2222-4222-8222-222222222222", mediaId: null,
    url: "https://example.invalid/feed", source: "instagram", type: "image", caption: null, details: {} }],
  mobileNumber: "+919999999999",
  mobileNumberVisible: true,
  socialLinks: [{ platform: "instagram", url: "https://instagram.com/tk", visible: true }],
  themeSettings: { preset: "minimal-light", recommendations: { layout: "grid" } },
  businessDetails: {},
};

vi.mock("../../../../lib/explorersApiClient", () => ({ explorersApiClient: { getMyProfile: vi.fn() } }));
vi.mock("../../../../store/useSetupStore", () => ({ default: (selector: any) => selector({ bindAccount: vi.fn() }) }));

vi.mock("../../../Profile/hooks/useUpdateProfile", () => ({
  useUpdateProfile: (documentId?: string) => {
    updateTargets.push(documentId);
    return { handleSubmit: updateSubmit };
  },
}));

vi.mock("../../../Profile/hooks/useReverseGeocoding", () => ({
  useReverseGeocoding: () => ({
    currentLocation: null,
    mappedAddress: {},
    handleGetCurrentLocation: vi.fn(),
  }),
}));

vi.mock("../../../Profile/components/ProfileForm", () => ({
  default: (props: any) => {
    harness.profileFormProps = props;
    return <div data-testid="profile-account-form" />;
  },
}));

vi.mock("../../../../components/ui/UsernameChangeConfirmationModal", () => ({
  default: (props: any) => {
    harness.usernameModalProps = props;
    return props.isOpen ? (
      <div>
        <button type="button" onClick={props.onConfirm}>
          Confirm username
        </button>
        <button type="button" onClick={props.onClose}>
          Cancel username
        </button>
      </div>
    ) : null;
  },
}));

vi.mock("../../../../store/store", () => ({
  default: Object.assign((selector?: (state: typeof authState) => unknown) => selector ? selector(authState) : authState,
    { getState: () => authState }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock("../../../../components/EarthLoader", () => ({
  EarthLoader: () => <div>Loading</div>,
}));

import ProfileAccountSettings from "../ProfileAccountSettings";

const renderAccountSettings = (section: "account" | "billing" = "account", cached?: typeof account) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached) client.setQueryData(["explorers-account", authState.user?.id ?? "cookie-session", authState.generation], cached);
  return render(<QueryClientProvider client={client}><ProfileAccountSettings section={section} /></QueryClientProvider>);
};

const visibleFieldNames = () =>
  harness.profileFormProps.formFields.flatMap((section: any) =>
    section.formFields.map((field: any) => field.name),
  );

describe("ProfileAccountSettings", () => {
  beforeEach(() => {
    harness.profileFormProps = undefined;
    harness.usernameModalProps = undefined;
    updateSubmit.mockReset();
    updateTargets.length = 0;
    updateSubmit.mockResolvedValue({ documentId: account.id, revision: 5 });
    toastError.mockReset();
    toastSuccess.mockReset();
    vi.mocked(explorersApiClient.getMyProfile).mockReset();
    vi.mocked(explorersApiClient.getMyProfile).mockResolvedValue(account as never);
    authState.user = {
      id: "user-1",
      documentId: "user-doc",
      username: "tk2727",
    };
  });

  it("does not mount the account form until a canonical account and handle are available", () => {
    authState.user = null;
    vi.mocked(explorersApiClient.getMyProfile).mockImplementation(() => new Promise(() => undefined));

    renderAccountSettings();

    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(harness.profileFormProps).toBeUndefined();
  });

  it("uses the canonical handle with a complete cache snapshot while the network is pending", () => {
    vi.mocked(explorersApiClient.getMyProfile).mockImplementation(() => new Promise(() => undefined));

    renderAccountSettings("account", account);

    expect(screen.getByTestId("profile-account-form")).toBeInTheDocument();
    expect(harness.profileFormProps.initialValues.username).toBe("tk2727");
  });

  it("uses Settings Account fields and preserves hidden profile data on save", async () => {
    renderAccountSettings();
    await screen.findByTestId("profile-account-form");

    expect(screen.getByTestId("profile-account-form")).toBeInTheDocument();
    expect(visibleFieldNames()).toEqual(["username", "accountType"]);

    await act(async () => {
      await harness.profileFormProps.onSubmit(
        harness.profileFormProps.initialValues,
      );
    });

    expect(updateSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "tk2727",
        accountType: "creator",
        documentId: account.id,
        revision: 4,
        Feed_Data: [expect.objectContaining({ id: account.feedItems[0].id })],
        Public_Profile_Address: account.publicAddress,
        social_media: expect.objectContaining({
          instagram: { link: "https://instagram.com/tk", visibility: true },
          theme_settings: {
            preset: "minimal-light",
            recommendations: { layout: "grid" },
          },
        }),
      }),
    );
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("targets the sole canonical completed account and carries its revision", async () => {
    renderAccountSettings();
    await screen.findByTestId("profile-account-form");

    expect(harness.profileFormProps.initialValues.accountName).toBe("TK Explorer");
    expect(harness.profileFormProps.initialValues.revision).toBe(4);
    expect(updateTargets.at(-1)).toBe(account.id);
    await act(async () => {
      await harness.profileFormProps.onSubmit(
        harness.profileFormProps.initialValues,
      );
    });
    expect(updateSubmit).toHaveBeenCalledTimes(1);
  });

  it("uses every detailed address field in Settings Billing", async () => {
    renderAccountSettings("billing", account);

    expect(visibleFieldNames()).toEqual([
      "address",
      "streetName",
      "state",
      "city",
      "country",
      "postalCode",
    ]);

    const setFieldValue = vi.fn();
    await act(async () => harness.profileFormProps.setPlaces(
      {
        formatted_address: "Detected address",
        address_components: [
          { long_name: "Detected City", short_name: "DC", types: ["locality"] },
          { long_name: "500099", short_name: "500099", types: ["postal_code"] },
        ],
        types: [],
        name: "Detected address",
      },
      setFieldValue,
    ));

    expect(setFieldValue).toHaveBeenCalledWith(
      "address",
      "Detected address",
    );
    expect(setFieldValue).toHaveBeenCalledWith("city", "Detected City");
    expect(setFieldValue).toHaveBeenCalledWith("postalCode", "500099");
  });

  it("waits for confirmation before changing a username and supports cancel", async () => {
    renderAccountSettings("account", account);

    let result: any;
    await act(async () => {
      result = await harness.profileFormProps.onSubmit({
        ...harness.profileFormProps.initialValues,
        username: "tk2727-new",
      });
    });

    expect(result.status).toBe("deferred");
    expect(updateSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel username" }));
    await expect(result.completion).resolves.toBe("cancelled");
    expect(updateSubmit).not.toHaveBeenCalled();
  });
});

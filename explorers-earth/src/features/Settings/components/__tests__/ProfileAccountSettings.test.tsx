import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, harness, queryState, updateSubmit, toastError, toastSuccess } = vi.hoisted(() => ({
  authState: {
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
  queryState: {
    data: undefined as any,
    loading: false,
    error: undefined as any,
    refetch: vi.fn(),
  },
  updateSubmit: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const account = {
  documentId: "account-1",
  Account_Name: "TK Explorer",
  Account_Type: "Creator",
  Bio: "Public bio",
  Addresss: {
    address: "Stored billing address",
    streetName: "Stored Street",
    city: "Hyderabad",
    state: "Telangana",
    country: "India",
    postalCode: "500001",
  },
  Primary_Address: { address: "Hyderabad, India" },
  Public_Profile_Address: { title: "Studio", placeId: "place-1" },
  Feed_Data: [{ id: "feed-1" }],
  mobile_number: "+919999999999",
  mobile_number_visibility: true,
  social_media: {
    instagram: { link: "https://instagram.com/tk", visibility: true },
    futurePlatform: { link: "future://tk", visibility: true },
    theme_settings: {
      preset: "minimal-light",
      recommendations: { layout: "mosaic" },
    },
  },
};

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return {
    ...actual,
    useQuery: () => queryState,
  };
});

vi.mock("../../../Profile/hooks/useUpdateProfile", () => ({
  useUpdateProfile: () => ({ handleSubmit: updateSubmit }),
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
  default: () => authState,
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

const visibleFieldNames = () =>
  harness.profileFormProps.formFields.flatMap((section: any) =>
    section.formFields.map((field: any) => field.name),
  );

describe("ProfileAccountSettings", () => {
  beforeEach(() => {
    harness.profileFormProps = undefined;
    harness.usernameModalProps = undefined;
    updateSubmit.mockReset();
    updateSubmit.mockResolvedValue({ documentId: "account-1" });
    toastError.mockReset();
    toastSuccess.mockReset();
    queryState.data = {
      usersPermissionsUser: {
        username: "tk2727",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
        accounts: [account],
      },
    };
    queryState.loading = false;
    queryState.error = undefined;
    authState.user = {
      id: "user-1",
      documentId: "user-doc",
      username: "tk2727",
    };
  });

  it("does not mount the account form until a username source is available", () => {
    authState.user = null;
    queryState.data = {
      usersPermissionsUser: {
        accounts: [account],
      },
    };
    queryState.loading = true;

    render(<ProfileAccountSettings section="account" />);

    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(harness.profileFormProps).toBeUndefined();
  });

  it("uses the authenticated username with a complete cache snapshot while the network is pending", () => {
    queryState.data = {
      usersPermissionsUser: {
        accounts: [account],
      },
    };
    queryState.loading = true;

    render(<ProfileAccountSettings section="account" />);

    expect(screen.getByTestId("profile-account-form")).toBeInTheDocument();
    expect(harness.profileFormProps.initialValues.username).toBe("tk2727");
  });

  it("uses Settings Account fields and preserves hidden profile data on save", async () => {
    render(<ProfileAccountSettings section="account" />);

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
        Feed_Data: [{ id: "feed-1" }],
        Public_Profile_Address: { title: "Studio", placeId: "place-1" },
        social_media: expect.objectContaining({
          futurePlatform: { link: "future://tk", visibility: true },
          theme_settings: {
            preset: "minimal-light",
            recommendations: { layout: "mosaic" },
          },
        }),
      }),
    );
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("uses every detailed address field in Settings Billing", () => {
    render(<ProfileAccountSettings section="billing" />);

    expect(visibleFieldNames()).toEqual([
      "address",
      "streetName",
      "state",
      "city",
      "country",
      "postalCode",
    ]);

    const setFieldValue = vi.fn();
    harness.profileFormProps.setPlaces(
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
    );

    expect(setFieldValue).toHaveBeenCalledWith(
      "address",
      "Detected address",
    );
    expect(setFieldValue).toHaveBeenCalledWith("city", "Detected City");
    expect(setFieldValue).toHaveBeenCalledWith("postalCode", "500099");
  });

  it("waits for confirmation before changing a username and supports cancel", async () => {
    render(<ProfileAccountSettings section="account" />);

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

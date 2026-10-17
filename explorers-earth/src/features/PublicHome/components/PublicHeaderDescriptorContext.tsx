import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import {
  getPublicHeaderFallback,
  resolvePublicHeaderRegistrationUrl,
  type PublicHeaderShareDescriptor,
} from "./publicHeaderDescriptor";

type OwnerToken = string;

type ActiveRegistration = {
  navigationKey: string;
  ownerToken: OwnerToken;
  descriptor: PublicHeaderShareDescriptor;
};

type PublicHeaderDescriptorContextValue = {
  descriptor: PublicHeaderShareDescriptor;
  issueOwnerToken: () => OwnerToken;
  registerDescriptor: (
    navigationKey: string,
    ownerToken: OwnerToken,
    descriptor: PublicHeaderShareDescriptor,
  ) => void;
  releaseDescriptor: (navigationKey: string, ownerToken: OwnerToken) => void;
};

const PublicHeaderDescriptorContext = createContext<PublicHeaderDescriptorContextValue | null>(null);

const descriptorFingerprint = (descriptor: PublicHeaderShareDescriptor): string => JSON.stringify({
  navigationKey: descriptor.navigationKey,
  title: descriptor.title,
  text: descriptor.text,
  url: descriptor.url,
  analyticsContext: descriptor.analyticsContext,
  analyticsReady: descriptor.analyticsReady,
  analyticsMetadata: descriptor.analyticsMetadata
    ? Object.fromEntries(Object.entries(descriptor.analyticsMetadata).sort(([a], [b]) => a.localeCompare(b)))
    : undefined,
});

const sanitizeDescriptor = (descriptor: PublicHeaderShareDescriptor): PublicHeaderShareDescriptor | null => {
  if (
    typeof descriptor.navigationKey !== "string"
    || typeof descriptor.title !== "string"
    || typeof descriptor.url !== "string"
    || typeof descriptor.analyticsContext !== "string"
    || (descriptor.text !== undefined && typeof descriptor.text !== "string")
  ) return null;

  const analyticsMetadata = descriptor.analyticsMetadata
    ? Object.fromEntries(Object.entries(descriptor.analyticsMetadata).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : undefined;
  return {
    navigationKey: descriptor.navigationKey,
    title: descriptor.title,
    ...(descriptor.text === undefined ? {} : { text: descriptor.text }),
    url: descriptor.url,
    analyticsContext: descriptor.analyticsContext,
    ...(typeof descriptor.analyticsReady === "boolean" ? { analyticsReady: descriptor.analyticsReady } : {}),
    ...(analyticsMetadata && Object.keys(analyticsMetadata).length > 0 ? { analyticsMetadata } : {}),
  };
};

export function PublicHeaderDescriptorProvider({
  children,
  origin = window.location.origin,
  username,
  profileName,
}: {
  children: ReactNode;
  origin?: string;
  username: string;
  profileName?: string;
}) {
  const location = useLocation();
  const activeNavigationKeyRef = useRef(location.key);
  activeNavigationKeyRef.current = location.key;
  const nextOwnerIdRef = useRef(0);
  const [registration, setRegistration] = useState<ActiveRegistration | null>(null);

  const fallback = useMemo(() => getPublicHeaderFallback({
    origin,
    pathname: location.pathname,
    search: location.search,
    username,
    profileName,
    navigationKey: location.key,
  }), [location.key, location.pathname, location.search, origin, profileName, username]);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const issueOwnerToken = useCallback(() => {
    nextOwnerIdRef.current += 1;
    return `public-header-owner-${nextOwnerIdRef.current}`;
  }, []);

  const registerDescriptor = useCallback((navigationKey: string, ownerToken: OwnerToken, descriptor: PublicHeaderShareDescriptor) => {
    if (navigationKey !== activeNavigationKeyRef.current) return;
    const registeredDescriptor = sanitizeDescriptor(descriptor);
    if (!registeredDescriptor || registeredDescriptor.navigationKey !== navigationKey) return;
    const safeDescriptor = {
      ...registeredDescriptor,
      url: resolvePublicHeaderRegistrationUrl({
        origin,
        username,
        currentSearch: location.search,
        registeredUrl: registeredDescriptor.url,
        fallbackUrl: fallbackRef.current.url,
      }),
    };
    const fingerprint = descriptorFingerprint(safeDescriptor);
    setRegistration((current) => {
      if (
        current?.navigationKey === navigationKey
        && current.ownerToken === ownerToken
        && descriptorFingerprint(current.descriptor) === fingerprint
      ) return current;
      return { navigationKey, ownerToken, descriptor: safeDescriptor };
    });
  }, [location.search, origin, username]);

  const releaseDescriptor = useCallback((navigationKey: string, ownerToken: OwnerToken) => {
    setRegistration((current) => (
      current?.navigationKey === navigationKey && current.ownerToken === ownerToken
        ? null
        : current
    ));
  }, []);

  const descriptor = registration?.navigationKey === location.key
    ? registration.descriptor
    : fallback;
  const value = useMemo(() => ({
    descriptor,
    issueOwnerToken,
    registerDescriptor,
    releaseDescriptor,
  }), [descriptor, issueOwnerToken, registerDescriptor, releaseDescriptor]);

  return <PublicHeaderDescriptorContext.Provider value={value}>{children}</PublicHeaderDescriptorContext.Provider>;
}

export function usePublicHeaderDescriptor(registration?: PublicHeaderShareDescriptor): PublicHeaderShareDescriptor {
  const context = useContext(PublicHeaderDescriptorContext);
  if (!context) throw new Error("usePublicHeaderDescriptor must be used within PublicHeaderDescriptorProvider");
  const fingerprint = registration ? descriptorFingerprint(registration) : "";
  const stableRegistration = useMemo(() => registration, [fingerprint]);

  useEffect(() => {
    if (!stableRegistration) return;
    const ownerToken = context.issueOwnerToken();
    context.registerDescriptor(stableRegistration.navigationKey, ownerToken, stableRegistration);
    return () => context.releaseDescriptor(stableRegistration.navigationKey, ownerToken);
  }, [context.issueOwnerToken, context.registerDescriptor, context.releaseDescriptor, stableRegistration]);

  return context.descriptor;
}

export const useOptionalPublicHeaderDescriptor = (): PublicHeaderShareDescriptor | null =>
  useContext(PublicHeaderDescriptorContext)?.descriptor ?? null;

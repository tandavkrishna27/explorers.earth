import { mapsBrowserKey } from "../lib/publicRuntimeConfig";
import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";

const GoogleMapsProviderContext = createContext(false);

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const alreadyProvided = useContext(GoogleMapsProviderContext);
  if (alreadyProvided) return children;
  return (
    <GoogleMapsProviderContext.Provider value>
      <APIProvider apiKey={mapsBrowserKey()}>{children}</APIProvider>
    </GoogleMapsProviderContext.Provider>
  );
}

export function withGoogleMapsProvider<Props extends object>(Component: ComponentType<Props>) {
  function GoogleMapsProviderBoundary(props: Props) {
    return <GoogleMapsProvider><Component {...props} /></GoogleMapsProvider>;
  }

  GoogleMapsProviderBoundary.displayName = `withGoogleMapsProvider(${Component.displayName || Component.name || "Component"})`;
  return GoogleMapsProviderBoundary;
}
